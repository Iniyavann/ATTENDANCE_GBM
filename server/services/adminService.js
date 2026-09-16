const bcrypt = require('bcryptjs'); const db = require('../database/db'); const SALT_ROUNDS = 12; const MIN_PASSWORD_LENGTH = 12;
function validatePassword(password) { if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) throw Object.assign(new Error(`Admin password must be at least ${MIN_PASSWORD_LENGTH} characters.`), {status:400}); }
async function getPrimaryAdmin() { return db.get('SELECT * FROM admins ORDER BY id LIMIT 1'); }
async function createAdmin(username, plainPassword) { validatePassword(plainPassword); if (await getPrimaryAdmin()) throw Object.assign(new Error('An admin account already exists. Use the settings page or the change-password flow to update it.'), {status:409}); const now=Date.now(); await db.run('INSERT INTO admins (username,password_hash,created_at,updated_at) VALUES (?,?,?,?)',[username,await bcrypt.hash(plainPassword,SALT_ROUNDS),now,now]); return getPrimaryAdmin(); }
async function verifyPassword(password) { const admin=await getPrimaryAdmin(); return !!admin && bcrypt.compareSync(password,admin.password_hash); }
async function changePassword(currentPassword, newPassword) {
  validatePassword(newPassword);
  const admin = await getPrimaryAdmin();
  if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
    throw Object.assign(new Error('Current admin password is incorrect.'), { status: 401 });
  }
  await db.run('UPDATE admins SET password_hash=?,updated_at=? WHERE id=?', [await bcrypt.hash(newPassword, SALT_ROUNDS), Date.now(), admin.id]);
}
async function setPrimaryAdminPassword(password) { validatePassword(password); const admin=await getPrimaryAdmin(); const hash=await bcrypt.hash(password,SALT_ROUNDS); if (!admin) await db.run('INSERT INTO admins (username,password_hash,created_at,updated_at) VALUES (?,?,?,?)',['admin',hash,Date.now(),Date.now()]); else await db.run('UPDATE admins SET password_hash=?,updated_at=? WHERE id=?',[hash,Date.now(),admin.id]); }
module.exports={getPrimaryAdmin,createAdmin,verifyPassword,changePassword,setPrimaryAdminPassword};
