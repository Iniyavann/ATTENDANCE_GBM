const db = require('../database/db');
const { todayISO, uid, computeLateStatus } = require('../utils/time');
const { haversineDistanceMeters } = require('../utils/geo');
const { getSettings } = require('./settingsService');
const branchService = require('./branchService');

const todaysForEmpStmt = db.prepare(`
  SELECT * FROM attendance WHERE employee_id = ? AND date = ? ORDER BY timestamp ASC
`);
const insertStmt = db.prepare(`
  INSERT INTO attendance (
    id, employee_id, employee_name, department, date, timestamp, type, late_status,
    photo_path, latitude, longitude, accuracy, distance_m, location_verified,
    location_verified_at, branch_id, branch_name, created_at
  ) VALUES (
    @id, @employee_id, @employee_name, @department, @date, @timestamp, @type, @late_status,
    @photo_path, @latitude, @longitude, @accuracy, @distance_m, @location_verified,
    @location_verified_at, @branch_id, @branch_name, @created_at
  )
`);
const findByIdStmt = db.prepare('SELECT * FROM attendance WHERE id = ?');
const rangeStmt = db.prepare(`
  SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY timestamp ASC
`);
const forDateStmt = db.prepare('SELECT * FROM attendance WHERE date = ? ORDER BY timestamp ASC');

// 'in'   -> no record yet today, next scan is a check-in
// 'out'  -> checked in but not out yet, next scan is a check-out
// 'done' -> already checked in AND out today - blocks further submissions
function getTodayStatus(employeeId) {
  const todays = todaysForEmpStmt.all(employeeId, todayISO());
  if (!todays.length) return { action: 'in', last: null };
  const last = todays[todays.length - 1];
  return { action: last.type === 'in' ? 'out' : 'done', last };
}

// Independently verifies a reported GPS position against the employee's active branch.
function verifyLocation(latitude, longitude, branch) {
  const location = branch || branchService.getDefaultBranch() || getSettings();
  const radius = Number(location.radiusMeters ?? location.officeRadiusMeters ?? 100);
  const distance = haversineDistanceMeters(
    Number(latitude), Number(longitude), Number(location.latitude ?? location.officeLat),
    Number(location.longitude ?? location.officeLng)
  );
  return {
    verified: distance <= radius,
    distance,
    radius,
    branchId: location.id || null,
    branchName: location.name || null
  };
}

/**
 * Records one attendance event (check-in or check-out) after re-validating
 * everything server-side: employee exists & is active, GPS distance, and
 * the in/out cycle (duplicate protection). Throws an Error with a .status
 * for anything invalid so the route can return the right HTTP code.
 */
function recordAttendance({ employee, latitude, longitude, accuracy, photoPath }) {
  if (!employee || employee.status !== 'Active') {
    const err = new Error('This employee ID is not valid or is inactive.');
    err.status = 403;
    throw err;
  }
  if (latitude == null || longitude == null) {
    const err = new Error('Location is required to mark attendance.');
    err.status = 400;
    throw err;
  }

  const branch = branchService.getBranch(employee.branch_id);
  if (!branch || branch.status !== 'Active') {
    const err = new Error('This employee is assigned to an inactive branch.');
    err.status = 403;
    throw err;
  }
  const { verified, distance, radius } = verifyLocation(latitude, longitude, branch);
  if (!verified) {
    const err = new Error(`You must be inside the office area to mark attendance (you are ~${Math.round(distance)}m away, allowed radius is ${radius}m).`);
    err.status = 403;
    throw err;
  }

  const status = getTodayStatus(employee.id);
  if (status.action === 'done') {
    const err = new Error('Attendance for today is already complete for this employee.');
    err.status = 409;
    throw err;
  }

  const type = status.action; // 'in' | 'out'
  const timestamp = Date.now(); // server time - never trust a client timestamp
  const settings = getSettings();
  const record = {
    id: uid(),
    employee_id: employee.id,
    employee_name: employee.name,
    department: employee.department || '',
    date: todayISO(),
    timestamp,
    type,
    late_status: type === 'in' ? computeLateStatus(timestamp, settings.officeStartTime, settings.graceMinutes) : null,
    photo_path: photoPath,
    latitude,
    longitude,
    accuracy: accuracy == null ? null : Number(accuracy),
    distance_m: distance,
    location_verified: 1,
    location_verified_at: timestamp,
    branch_id: branch.id,
    branch_name: branch.name,
    created_at: timestamp
  };
  insertStmt.run(record);
  return toApi(record);
}

function toApi(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    date: row.date,
    timestamp: row.timestamp,
    type: row.type,
    lateStatus: row.late_status,
    hasPhoto: !!row.photo_path,
    distanceMeters: row.distance_m,
    locationVerified: !!row.location_verified,
    branchId: row.branch_id || null,
    branchName: row.branch_name || ''
  };
}

function getById(id) {
  return findByIdStmt.get(id);
}

function listByRange(from, to) {
  return rangeStmt.all(from, to).map(toApi);
}

function listByDate(date) {
  return forDateStmt.all(date).map(toApi);
}

function listAll() {
  return db.prepare('SELECT * FROM attendance ORDER BY timestamp ASC').all().map(toApi);
}

module.exports = {
  getTodayStatus, verifyLocation, recordAttendance, getById,
  listByRange, listByDate, listAll, toApi
};
