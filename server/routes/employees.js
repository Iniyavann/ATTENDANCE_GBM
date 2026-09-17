const express = require('express');
const employeeService = require('../services/employeeService');
const { requireAdmin } = require('../middleware/auth');
const { publicPortalLimiter } = require('../middleware/rateLimiters');
const { requireSoftwareOn } = require('../services/softwareService');

const router = express.Router();

// PUBLIC - used by the employee portal to validate an ID as it's typed.
// Only returns the minimal, non-sensitive fields the original frontend
// already displayed (name, department, status) - never phone/email.
router.get('/lookup/:id', publicPortalLimiter, requireSoftwareOn, async (req, res) => {
  const emp = await employeeService.findEmployee(req.params.id);
  if (!emp) return res.status(404).json({ found: false });
  res.json({
    found: true,
    employee: {
      id: emp.id,
      name: emp.name,
      department: emp.department,
      branchId: emp.branchId,
      branchName: emp.branchName || '',
      status: emp.status === 'Active' && emp.branchStatus !== 'Inactive' ? 'Active' : 'Inactive'
    }
  });
});

// Everything below is admin-only.
router.use(requireAdmin);

router.get('/', async (req, res) => {
  res.json({ employees: await employeeService.listEmployees() });
});

router.post('/', async (req, res) => {
  const { id, name, department, designation, phone, email, status, branchId } = req.body || {};
  if (!id || !String(id).trim() || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'Employee ID and name are required.' });
  }
  try {
    const employee = await employeeService.createEmployee({ id, name, department, designation, phone, email, status, branchId });
    res.status(201).json({ employee });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create employee.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, department, designation, phone, email, status, branchId } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  try {
    const employee = await employeeService.updateEmployee(req.params.id, { name, department, designation, phone, email, status, branchId });
    res.json({ employee });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not update employee.' });
  }
});

router.delete('/:id', async (req, res) => {
  await employeeService.deleteEmployee(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
