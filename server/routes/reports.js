const express = require('express');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

// Builds one row per employee per day, combining check-in/check-out pairs
// with any Leave/Week-Off/Compensatory-Leave record for that same day -
// mirrors the logic the dashboard/report pages use in the browser.
async function buildDailyRows({ from, to, employeeId, branchId }) {
  const attParams = [];
  let attSql = 'SELECT * FROM attendance WHERE 1=1';
  if (from) { attSql += ' AND date >= ?'; attParams.push(from); }
  if (to) { attSql += ' AND date <= ?'; attParams.push(to); }
  if (employeeId && employeeId !== 'all') { attSql += ' AND employee_id = ?'; attParams.push(employeeId); }
  if (branchId && branchId !== 'all') { attSql += ' AND branch_id = ?'; attParams.push(branchId); }
  const attRows = await db.all(attSql, attParams);

  const loParams = [];
  let loSql = 'SELECT * FROM leave_off WHERE 1=1';
  if (from) { loSql += ' AND date >= ?'; loParams.push(from); }
  if (to) { loSql += ' AND date <= ?'; loParams.push(to); }
  if (employeeId && employeeId !== 'all') { loSql += ' AND employee_id = ?'; loParams.push(employeeId); }
  if (branchId && branchId !== 'all') { loSql += ' AND branch_id = ?'; loParams.push(branchId); }
  const loRows = await db.all(loSql, loParams);

  const map = {};
  attRows.forEach(r => {
    const key = r.employee_id + '|' + r.date;
    if (!map[key]) map[key] = { employeeId: r.employee_id, employeeName: r.employee_name, department: r.department, branchId: r.branch_id, branchName: r.branch_name, date: r.date, checkIn: null, checkOut: null, leave: null };
    if (r.type === 'in') map[key].checkIn = { timestamp: r.timestamp, lateStatus: r.late_status };
    else map[key].checkOut = { timestamp: r.timestamp };
  });
  loRows.forEach(r => {
    const key = r.employee_id + '|' + r.date;
    const leave = { status: r.status, leaveInfo: r.leave_info, reason: r.reason };
    if (!map[key]) map[key] = { employeeId: r.employee_id, employeeName: r.employee_name, department: r.department, branchId: r.branch_id, branchName: r.branch_name, date: r.date, checkIn: null, checkOut: null, leave };
    else map[key].leave = leave;
  });

  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
}

// GET /api/reports/attendance?from=&to=&employeeId=
router.get('/attendance', async (req, res) => {
  const { from, to, employeeId, branchId } = req.query;
  res.json({ rows: await buildDailyRows({ from, to, employeeId, branchId }) });
});

// GET /api/reports/employee/:employeeId?from=&to=
router.get('/employee/:employeeId', async (req, res) => {
  const { from, to, branchId } = req.query;
  res.json({ rows: await buildDailyRows({ from, to, employeeId: req.params.employeeId, branchId }) });
});

module.exports = router;
