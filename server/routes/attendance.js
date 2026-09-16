const express = require('express');
const path = require('path');
const fs = require('fs');
const employeeService = require('../services/employeeService');
const attendanceService = require('../services/attendanceService');
const branchService = require('../services/branchService');
const { requireAdmin } = require('../middleware/auth');
const { requireSoftwareOn } = require('../services/softwareService');
const { publicPortalLimiter } = require('../middleware/rateLimiters');
const { upload, UPLOADS_DIR } = require('../middleware/upload');
const photoStorage = require('../services/photoStorageService');

const router = express.Router();

// PUBLIC - today's check-in/out cycle status for one employee, used by the
// portal to decide "Continue to check in" vs "check out" vs "already done".
router.get('/status/:employeeId', publicPortalLimiter, requireSoftwareOn, async (req, res) => {
  const emp = await employeeService.findEmployee(req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  const { action, last } = await attendanceService.getTodayStatus(emp.id);
  const todaysAll = await attendanceService.listByDate(require('../utils/time').todayISO())
    .filter(r => r.employeeId === emp.id);
  const checkIn = todaysAll.find(r => r.type === 'in') || null;
  const checkOut = todaysAll.find(r => r.type === 'out') || null;

  res.json({
    action,
    today: {
      checkIn: checkIn ? { timestamp: checkIn.timestamp, lateStatus: checkIn.lateStatus } : null,
      checkOut: checkOut ? { timestamp: checkOut.timestamp } : null
    }
  });
});

// PUBLIC - independently verifies a GPS reading against the employee's branch.
// This never trusts a "verified" flag from the browser - it recalculates
// the distance itself using the Haversine formula.
router.post('/verify-location', publicPortalLimiter, requireSoftwareOn, async (req, res) => {
  const { latitude, longitude, employeeId } = req.body || {};
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Location coordinates are required.' });
  }
  const lat = Number(latitude), lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid location coordinates.' });
  }
  const employee = employeeId ? await employeeService.findEmployee(employeeId) : null;
  if (employeeId && !employee) return res.status(404).json({ error: 'Employee not found.' });
  const branch = employee ? await branchService.getBranch(employee.branchId) : null;
  if (employee && (!branch || branch.status !== 'Active')) {
    return res.status(403).json({ error: 'This employee is assigned to an inactive branch.' });
  }
  const result = await attendanceService.verifyLocation(lat, lng, branch);
  res.json(result);
});

// PUBLIC - submits one attendance event (check-in or check-out) with a
// photo. Re-validates employee status, GPS distance and the in/out cycle
// on the server, no matter what the client already showed the employee.
router.post('/', publicPortalLimiter, requireSoftwareOn, upload.single('photo'), async (req, res) => {
  const { employeeId, latitude, longitude, accuracy } = req.body || {};
  if (!employeeId) {
    if (req.file) await photoStorage.remove(req.file.filename);
    return res.status(400).json({ error: 'Employee ID is required.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'An attendance photo is required.' });
  }

  const employee = await employeeService.findEmployee(employeeId);
  let photoReference;
  try {
    photoReference = await photoStorage.save(req.file);
    const record = await attendanceService.recordAttendance({
      employee,
      latitude: latitude == null ? null : Number(latitude),
      longitude: longitude == null ? null : Number(longitude),
      accuracy: accuracy == null ? null : Number(accuracy),
      photoPath: photoReference
    });
    res.status(201).json({ record });
  } catch (err) {
    // Roll back the uploaded object/file if the attendance record was rejected.
    await photoStorage.remove(photoReference || req.file.filename);
    res.status(err.status || 500).json({ error: err.message || 'Could not record attendance.' });
  }
});

// Everything below is admin-only.
router.use(requireAdmin);

// GET /api/attendance?date=&employeeId=&branchId=&from=&to=
router.get('/', async (req, res) => {
  const { from, to, branchId } = req.query;
  let records;
  if (from || to) {
    records = await attendanceService.listByRange(from || '0000-01-01', to || '9999-12-31');
  } else {
    records = await attendanceService.listAll();
  }
  if (branchId && branchId !== 'all') records = records.filter(r => String(r.branchId) === String(branchId));
  res.json({ attendance: records });
});

// Streams an attendance photo - only reachable by a signed-in admin.
router.get('/photo/:id', async (req, res) => {
  const record = await attendanceService.getById(req.params.id);
  if (!record || !record.photo_path) return res.status(404).end();
  if (photoStorage.isSupabase()) {
    try {
      const url = await photoStorage.signedUrl(record.photo_path);
      return res.redirect(url);
    } catch (err) {
      console.error('Could not create attendance photo URL:', err);
      return res.status(404).end();
    }
  }
  const filePath = path.join(UPLOADS_DIR, record.photo_path);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

module.exports = router;
