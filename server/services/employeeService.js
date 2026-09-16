const db = require('../database/db');
const branchService = require('./branchService');

const listStmt = db.prepare(`
  SELECT e.*, b.name AS branch_name, b.status AS branch_status
  FROM employees e LEFT JOIN branch_locations b ON b.id = e.branch_id
  ORDER BY e.created_at ASC
`);
const findStmt = db.prepare(`
  SELECT e.*, b.name AS branch_name, b.status AS branch_status
  FROM employees e LEFT JOIN branch_locations b ON b.id = e.branch_id
  WHERE e.id = ?
`);
const insertStmt = db.prepare(`
  INSERT INTO employees (id, name, department, designation, phone, email, status, branch_id, created_at, updated_at)
  VALUES (@id, @name, @department, @designation, @phone, @email, @status, @branch_id, @created_at, @updated_at)
`);
const updateStmt = db.prepare(`
  UPDATE employees SET name=@name, department=@department, designation=@designation,
    phone=@phone, email=@email, status=@status, branch_id=@branch_id, updated_at=@updated_at WHERE id=@id
`);
const deleteStmt = db.prepare('DELETE FROM employees WHERE id = ?');

function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    designation: row.designation,
    phone: row.phone,
    email: row.email,
    status: row.status,
    branchId: row.branch_id,
    branchName: row.branch_name || '',
    branchStatus: row.branch_status || null
  };
}

function listEmployees() {
  return listStmt.all().map(toApi);
}

function findEmployee(id) {
  if (!id) return null;
  return findStmt.get(String(id).toUpperCase());
}

function resolveBranch(branchId, allowInactive = false) {
  const branch = branchId == null || branchId === ''
    ? (branchService.getActiveBranch(branchService.getDefaultBranch()?.id) ||
       branchService.listBranches().find(b => b.status === 'Active'))
    : (allowInactive ? branchService.getBranch(branchId) : branchService.getActiveBranch(branchId));
  if (!branch) {
    const err = new Error('An active branch is required.');
    err.status = 400;
    throw err;
  }
  return branch;
}

function createEmployee({ id, name, department, designation, phone, email, status, branchId }) {
  const cleanId = String(id).trim().toUpperCase();
  if (findStmt.get(cleanId)) {
    const err = new Error('An employee with this ID already exists.');
    err.status = 409;
    throw err;
  }
  const now = Date.now();
  const branch = resolveBranch(branchId);
  insertStmt.run({
    id: cleanId,
    name: String(name).trim(),
    department: (department || '').trim(),
    designation: (designation || '').trim(),
    phone: (phone || '').trim(),
    email: (email || '').trim(),
    status: status === 'Inactive' ? 'Inactive' : 'Active',
    branch_id: branch.id,
    created_at: now,
    updated_at: now
  });
  return toApi(findStmt.get(cleanId));
}

function updateEmployee(id, { name, department, designation, phone, email, status, branchId }) {
  const existing = findStmt.get(String(id).toUpperCase());
  if (!existing) {
    const err = new Error('Employee not found.');
    err.status = 404;
    throw err;
  }
  const branch = resolveBranch(branchId == null ? existing.branch_id : branchId, branchId == null);
  updateStmt.run({
    id: existing.id,
    name: String(name ?? existing.name).trim(),
    department: (department ?? existing.department ?? '').trim(),
    designation: (designation ?? existing.designation ?? '').trim(),
    phone: (phone ?? existing.phone ?? '').trim(),
    email: (email ?? existing.email ?? '').trim(),
    status: status === 'Inactive' ? 'Inactive' : 'Active',
    branch_id: branch.id,
    updated_at: Date.now()
  });
  return toApi(findStmt.get(existing.id));
}

// Historical attendance rows keep their own snapshot of employeeName/department,
// so deleting an employee never touches past attendance records.
function deleteEmployee(id) {
  deleteStmt.run(String(id).toUpperCase());
}

module.exports = { listEmployees, findEmployee, createEmployee, updateEmployee, deleteEmployee, toApi };
