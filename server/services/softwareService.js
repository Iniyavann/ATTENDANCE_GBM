const db = require('../database/db');
const SOFTWARE_OFF_MESSAGE = 'This system is currently unavailable. Please contact your administrator.';
async function isSoftwareOn() { const row = await db.get('SELECT value FROM settings WHERE key = ?', ['softwareStatus']); return !row || String(row.value).toLowerCase() !== 'off'; }
async function getStatus() { return { enabled: await isSoftwareOn() }; }
async function setStatus(enabled) { await db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ['softwareStatus', enabled ? 'on' : 'off']); return getStatus(); }
function requireSoftwareOn(req, res, next) { isSoftwareOn().then(on => on ? next() : res.status(503).json({ error: SOFTWARE_OFF_MESSAGE, softwareOn: false })).catch(next); }
module.exports = { SOFTWARE_OFF_MESSAGE, isSoftwareOn, getStatus, setStatus, requireSoftwareOn };
