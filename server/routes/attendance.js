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

const router = express.Router();

// PUBLIC - today's check-in/out cycle status for one employee, used by the
// portal to decide "Continue to check in" vs "check out" vs "already done".
router.get('/status/:employeeId', publicPortalLimiter, requireSoftwareOn, (req, res) => {
  const emp = employeeService.findEmployee(req.params.employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  const { action, last } = attendanceService.getTodayStatus(emp.id);
  const todaysAll = attendanceService.listByDate(require('../utils/time').todayISO())
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
router.post('/verify-location', publicPortalLimiter, requireSoftwareOn, (req, res) => {
  const { latitude, longitude, employeeId } = req.body || {};
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: 'Location coordinates are required.' });
  }
  const lat = Number(latitude), lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid location coordinates.' });
  }
  const employee = employeeId ? employeeService.findEmployee(employeeId) : null;
  if (employeeId && !employee) return res.status(404).json({ error: 'Employee not found.' });
  const branch = employee ? branchService.getBranch(employee.branch_id) : null;
  if (employee && (!branch || branch.status !== 'Active')) {
    return res.status(403).json({ error: 'This employee is assigned to an inactive branch.' });
  }
  const result = attendanceService.verifyLocation(lat, lng, branch);
  res.json(result);
});

// PUBLIC - submits one attendance event (check-in or check-out) with a
// photo. Re-validates employee status, GPS distance and the in/out cycle
// on the server, no matter what the client already showed the employee.
router.post('/', publicPortalLimiter, requireSoftwareOn, upload.single('photo'), (req, res) => {
  const { employeeId, latitude, longitude, accuracy } = req.body || {};
  if (!employeeId) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Employee ID is required.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'An attendance photo is required.' });
  }

  const employee = employeeService.findEmployee(employeeId);
  try {
    const record = attendanceService.recordAttendance({
      employee,
      latitude: latitude == null ? null : Number(latitude),
      longitude: longitude == null ? null : Number(longitude),
      accuracy: accuracy == null ? null : Number(accuracy),
      photoPath: req.file.filename
    });
    res.status(201).json({ record });
  } catch (err) {
    // Roll back the uploaded file if the attendance record was rejected.
    fs.unlink(req.file.path, () => {});
    res.status(err.status || 500).json({ error: err.message || 'Could not record attendance.' });
  }
});

// Everything below is admin-only.
router.use(requireAdmin);

// GET /api/attendance?date=&employeeId=&branchId=&from=&to=
router.get('/', (req, res) => {
  const { from, to, branchId } = req.query;
  let records;
  if (from || to) {
    records = attendanceService.listByRange(from || '0000-01-01', to || '9999-12-31');
  } else {
    records = attendanceService.listAll();
  }
  if (branchId && branchId !== 'all') records = records.filter(r => String(r.branchId) === String(branchId));
  res.json({ attendance: records });
});

// Streams an attendance photo - only reachable by a signed-in admin.
router.get('/photo/:id', (req, res) => {
  const record = attendanceService.getById(req.params.id);
  if (!record || !record.photo_path) return res.status(404).end();
  const filePath = path.join(UPLOADS_DIR, record.photo_path);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

module.exports = router;
