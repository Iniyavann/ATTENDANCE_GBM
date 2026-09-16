const db = require('../database/db');

const SOFTWARE_OFF_MESSAGE = 'This system is currently unavailable. Please contact your administrator.';
const getStatusStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

function isSoftwareOn() {
  const row = getStatusStmt.get('softwareStatus');
  return !row || String(row.value).toLowerCase() !== 'off';
}

function getStatus() {
  return { enabled: isSoftwareOn() };
}

function setStatus(enabled) {
  upsertStmt.run('softwareStatus', enabled ? 'on' : 'off');
  return getStatus();
}

function requireSoftwareOn(req, res, next) {
  if (isSoftwareOn()) return next();
  return res.status(503).json({ error: SOFTWARE_OFF_MESSAGE, softwareOn: false });
}

module.exports = { SOFTWARE_OFF_MESSAGE, isSoftwareOn, getStatus, setStatus, requireSoftwareOn };
