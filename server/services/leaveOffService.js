const db = require('../database/db');
const { uid } = require('../utils/time');
const branchService = require('./branchService');

const listAllStmt = db.prepare('SELECT * FROM leave_off ORDER BY date DESC');
const findByEmpDateStmt = db.prepare('SELECT * FROM leave_off WHERE employee_id = ? AND date = ?');
const insertStmt = db.prepare(`
  INSERT INTO leave_off (id, employee_id, employee_name, department, date, status, leave_info, reason, branch_id, branch_name, created_at, updated_at)
  VALUES (@id, @employee_id, @employee_name, @department, @date, @status, @leave_info, @reason, @branch_id, @branch_name, @created_at, @updated_at)
`);
const updateStmt = db.prepare(`
  UPDATE leave_off SET status=@status, leave_info=@leave_info, reason=@reason, updated_at=@updated_at
  WHERE id=@id
`);

function toApi(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    date: row.date,
    status: row.status,
    leaveInfo: row.leave_info,
    reason: row.reason,
    branchId: row.branch_id || null,
    branchName: row.branch_name || '',
    createdAt: row.created_at
  };
}

function listAll() {
  return listAllStmt.all().map(toApi);
}

// Upserts on (employee_id, date), matching the original app's behavior of
// one Leave/Off record per employee per day.
function upsert({ employee, date, status, leaveInfo, reason }) {
  const existing = findByEmpDateStmt.get(employee.id, date);
  const now = Date.now();
  if (existing) {
    updateStmt.run({
      id: existing.id,
      status,
      leave_info: leaveInfo || null,
      reason: reason || '',
      branch_id: employee.branch_id || null,
      branch_name: branchService.getBranch(employee.branch_id)?.name || '',
      updated_at: now
    });
    return toApi(findByEmpDateStmt.get(employee.id, date));
  }
  const record = {
    id: uid(),
    employee_id: employee.id,
    employee_name: employee.name,
    department: employee.department || '',
    date,
    status,
    leave_info: leaveInfo || null,
    reason: reason || '',
    branch_id: employee.branch_id || null,
    branch_name: branchService.getBranch(employee.branch_id)?.name || '',
    created_at: now,
    updated_at: now
  };
  insertStmt.run(record);
  return toApi(record);
}

module.exports = { listAll, upsert };
