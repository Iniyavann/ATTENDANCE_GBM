require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

require('./database/db'); // opens the DB and runs migrations as a side effect

// On free hosts without shell access (e.g. Render's free tier) there's no
// way to run "npm run create-admin" interactively. If ADMIN_USERNAME and
// ADMIN_PASSWORD are set as environment variables and no admin exists yet,
// create one automatically on boot. Safe to leave these variables set
// permanently — this only ever runs once, the first time, and never
// overwrites an existing account.
(function bootstrapAdminFromEnv(){
  const adminService = require('./services/adminService');
  if (adminService.getPrimaryAdmin()) return;
  const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 4) {
      console.warn('⚠  ADMIN_PASSWORD is too short (min 4 characters) - skipping auto-setup.');
      return;
    }
    adminService.createAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
    console.log(`✔ Created admin account "${ADMIN_USERNAME}" from environment variables.`);
  } else {
    console.warn(
      '\n⚠  No admin account exists yet. Either run "npm run create-admin" (if you have shell access)\n' +
      '   or set ADMIN_USERNAME and ADMIN_PASSWORD environment variables and restart the server.\n'
    );
  }
})();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-to-a-long-random-string') {
  console.warn(
    '\n⚠  JWT_SECRET is missing or still set to the example value.\n' +
    '   Set a real random secret in your .env file before using this in anything but local testing.\n'
  );
}

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const settingsRoutes = require('./routes/settings');
const reportsRoutes = require('./routes/reports');
const branchRoutes = require('./routes/branches');
const ownerRoutes = require('./routes/owner');

const app = express();

// Render and similar reverse proxies need the real client IP for rate limits.
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false // the frontend loads Google Fonts + the XLSX CDN script
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/owner', ownerRoutes);

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Centralized error handler - never leaks internal error details to the client.
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('Only JPEG, PNG or WEBP')) {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Photo is too large (max 5MB).' });
  }
  console.error(err); // full detail goes to the server log only
  res.status(err.status || 500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GBM Attendance server running at http://localhost:${PORT}`);
});
