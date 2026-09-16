const db = require('../database/db');
const WRITABLE_KEYS = ['companyName','officeStartTime','graceMinutes','officeEndTime','officeLat','officeLng','officeRadiusMeters'];
async function getSettings() {
  const raw = Object.fromEntries((await db.all('SELECT key,value FROM settings')).map(r => [r.key, r.value]));
  return { companyName: raw.companyName || 'GBM', officeStartTime: raw.officeStartTime || '09:30', graceMinutes: Number(raw.graceMinutes || 15), officeEndTime: raw.officeEndTime || '18:30', officeLat: Number(raw.officeLat), officeLng: Number(raw.officeLng), officeRadiusMeters: Number(raw.officeRadiusMeters || 100) };
}
async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch).filter(([k]) => WRITABLE_KEYS.includes(k)))
    await db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
  return getSettings();
}
async function getPublicSettings() { const s = await getSettings(); return { companyName:s.companyName, officeStartTime:s.officeStartTime, graceMinutes:s.graceMinutes, officeEndTime:s.officeEndTime }; }
module.exports = { getSettings, updateSettings, getPublicSettings };
