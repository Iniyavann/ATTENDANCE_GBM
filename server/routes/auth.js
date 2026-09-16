const express = require('express');
const adminService = require('../services/adminService');
const ownerService = require('../services/ownerService');
const softwareService = require('../services/softwareService');
const { signToken, setAuthCookie, clearAuthCookie, requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// POST /api/auth/login  { passcode }
router.post('/login', loginLimiter, (req, res) => {
  const { passcode } = req.body || {};
  if (!passcode || typeof passcode !== 'string') {
    return res.status(400).json({ error: 'Passcode is required.' });
  }

  const admin = adminService.getPrimaryAdmin();
  const owner = ownerService.getOwner();
  if (!admin && !owner) {
    return res.status(503).json({
      error: 'No admin account has been set up yet. Run "npm run create-admin" on the server first.'
    });
  }

  // Owner access remains available while the employee/admin software is
  // disabled so the owner can restore service. Normal admin authentication
  // is blocked server-side before credentials are accepted in that state.
  let role = null;
  if (ownerService.verifyPassword(passcode)) {
    role = 'owner';
  } else if (!softwareService.isSoftwareOn()) {
    return res.status(503).json({
      error: 'System is currently disabled. Please contact the administrator.',
      softwareOn: false
    });
  } else if (adminService.verifyPassword(passcode)) {
    role = 'admin';
  }
  if (!role) {
    return res.status(401).json({ error: 'Incorrect passcode. Try again.' });
  }

  const token = signToken(role);
  setAuthCookie(res, token);
  res.json({ ok: true, role });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAdmin, (req, res) => {
  res.json({ ok: true, role: req.admin.role });
});

module.exports = router;
