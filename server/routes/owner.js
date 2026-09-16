const express = require('express');
const ownerService = require('../services/ownerService');
const softwareService = require('../services/softwareService');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(requireOwner);

router.get('/software-status', async (req, res) => {
  res.json({ software: await softwareService.getStatus() });
});

router.put('/software-status', async (req, res) => {
  const body = req.body || {};
  if (typeof body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'Software status must be enabled or disabled.' });
  }
  res.json({ software: await softwareService.setStatus(body.enabled) });
});

router.put('/password', async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (![currentPassword, newPassword, confirmPassword].every(value => typeof value === 'string' && value.length > 0)) {
    return res.status(400).json({ error: 'Current, new, and confirm passwords are required.' });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: 'New owner password must be at least 12 characters.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation do not match.' });
  }
  try {
    await ownerService.changePassword(currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not change owner password.' });
  }
});

module.exports = router;
