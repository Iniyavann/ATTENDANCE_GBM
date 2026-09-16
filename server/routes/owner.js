const express = require('express');
const ownerService = require('../services/ownerService');
const softwareService = require('../services/softwareService');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(requireOwner);

router.get('/software-status', (req, res) => {
  res.json({ software: softwareService.getStatus() });
});

router.put('/software-status', (req, res) => {
  const body = req.body || {};
  if (typeof body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Software status must be enabled or disabled.' });
  }
  res.json({ software: softwareService.setStatus(body.enabled) });
});

router.put('/password', (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (![currentPassword, newPassword, confirmPassword].every(value => typeof value === 'string' && value.length > 0)) {
    return res.status(400).json({ error: 'Current, new, and confirm passwords are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New owner password must be at least 8 characters.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation do not match.' });
  }
  try {
    ownerService.changePassword(currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not change owner password.' });
  }
});

module.exports = router;
