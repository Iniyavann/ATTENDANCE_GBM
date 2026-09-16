const db = require('../database/db');

const getAllStmt = db.prepare('SELECT key, value FROM settings');
const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

// Returns settings as a plain object with correct types.
function getSettings() {
  const rows = getAllStmt.all();
  const raw = {};
  rows.forEach(r => { raw[r.key] = r.value; });
  return {
    companyName: raw.companyName || 'GBM',
    officeStartTime: raw.officeStartTime || '09:30',
    graceMinutes: Number(raw.graceMinutes || 15),
    officeEndTime: raw.officeEndTime || '18:30',
    officeLat: Number(raw.officeLat),
    officeLng: Number(raw.officeLng),
    officeRadiusMeters: Number(raw.officeRadiusMeters || 100)
  };
}

// Only accepts known, safe keys - never lets a request write arbitrary keys.
const WRITABLE_KEYS = [
  'companyName', 'officeStartTime', 'graceMinutes', 'officeEndTime',
  'officeLat', 'officeLng', 'officeRadiusMeters'
];

function updateSettings(patch) {
  const update = db.transaction((entries) => {
    for (const [key, value] of entries) upsertStmt.run(key, String(value));
  });
  const entries = Object.entries(patch).filter(([k]) => WRITABLE_KEYS.includes(k));
  update(entries);
  return getSettings();
}

// Settings that are safe to expose to the public (unauthenticated) portal -
// never includes admin credentials, since there aren't any stored here.
function getPublicSettings() {
  const s = getSettings();
  return {
    companyName: s.companyName,
    officeStartTime: s.officeStartTime,
    graceMinutes: s.graceMinutes,
    officeEndTime: s.officeEndTime
  };
}

module.exports = { getSettings, updateSettings, getPublicSettings };
