const express = require('express');
const employeeService = require('../services/employeeService');
const leaveOffService = require('../services/leaveOffService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.get('/', async (req, res) => {
  res.json({ leaveOff: await leaveOffService.listAll() });
});

router.post('/', async (req, res) => {
  const { employeeId, date, status, leaveInfo, reason } = req.body || {};
  if (!employeeId) return res.status(400).json({ error: 'Employee ID is required.' });
  if (!date) return res.status(400).json({ error: 'Date is required.' });
  if (!status) return res.status(400).json({ error: 'Status/type is required.' });
  if (status === 'Leave' && !leaveInfo) {
    return res.status(400).json({ error: 'Please specify Informed or Not informed.' });
  }
  const employee = await employeeService.findEmployee(employeeId);
  if (!employee) return res.status(404).json({ error: 'No employee found with this ID.' });

  const record = await leaveOffService.upsert({ employee, date, status, leaveInfo, reason });
  res.status(201).json({ record });
});

module.exports = router;
