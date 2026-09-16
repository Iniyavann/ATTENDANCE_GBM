const express = require('express');
const settingsService = require('../services/settingsService');
const adminService = require('../services/adminService');
const branchService = require('../services/branchService');
const softwareService = require('../services/softwareService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// PUBLIC - only company name / office hours, shown on the employee portal
// before anyone signs in. Never includes GPS coordinates or credentials.
router.get('/public', async (req, res) => {
  res.json({
    settings: await settingsService.getPublicSettings(),
    softwareOn: await softwareService.isSoftwareOn()
  });
});

router.get('/', requireAdmin, async (req, res) => {
  res.json({ settings: await settingsService.getSettings(), branches: await branchService.listBranches() });
});

router.put('/', requireAdmin, async (req, res) => {
  const { companyName, officeStartTime, graceMinutes, officeEndTime, adminPasscode } = req.body || {};
  const patch = {};
  if (companyName != null) patch.companyName = String(companyName).trim() || 'GBM';
  if (officeStartTime != null) patch.officeStartTime = String(officeStartTime).trim() || '09:30';
  if (graceMinutes != null) patch.graceMinutes = Math.max(0, parseInt(graceMinutes, 10) || 0);
  if (officeEndTime != null) patch.officeEndTime = String(officeEndTime).trim() || '18:30';

  const settings = await settingsService.updateSettings(patch);

  // Only touches the admin password if a new one was actually typed -
  // the frontend never receives or pre-fills the current passcode.
  if (adminPasscode && String(adminPasscode).trim()) {
    await adminService.setPrimaryAdminPassword(String(adminPasscode).trim());
  }

  res.json({ settings });
});

module.exports = router;
