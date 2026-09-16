const bcrypt = require('bcryptjs');
const db = require('../database/db');

const firstAdminStmt = db.prepare('SELECT * FROM admins ORDER BY id ASC LIMIT 1');
const insertStmt = db.prepare(`
  INSERT INTO admins (username, password_hash, created_at, updated_at)
  VALUES (@username, @password_hash, @created_at, @updated_at)
`);
const updatePasswordStmt = db.prepare(`
  UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?
`);

const SALT_ROUNDS = 12;

// The app follows the original single-passcode design: there is one admin
// account ("the office admin"), matching the original UI which only ever
// asked for one shared passcode - just backed by a hashed password now
// instead of a plaintext value sitting in the frontend.
function getPrimaryAdmin() {
  return firstAdminStmt.get();
}

function createAdmin(username, plainPassword) {
  const existing = firstAdminStmt.get();
  if (existing) {
    const err = new Error('An admin account already exists. Use the settings page or the change-password flow to update it.');
    err.status = 409;
    throw err;
  }
  const now = Date.now();
  const password_hash = bcrypt.hashSync(plainPassword, SALT_ROUNDS);
  insertStmt.run({ username, password_hash, created_at: now, updated_at: now });
  return getPrimaryAdmin();
}

function verifyPassword(plainPassword) {
  const admin = getPrimaryAdmin();
  if (!admin) return false;
  return bcrypt.compareSync(plainPassword, admin.password_hash);
}

// Used by the Settings page when the admin changes the passcode. Creates
// the admin account on the fly if one somehow doesn't exist yet.
function setPrimaryAdminPassword(newPassword) {
  const admin = getPrimaryAdmin();
  const password_hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  if (!admin) {
    insertStmt.run({ username: 'admin', password_hash, created_at: Date.now(), updated_at: Date.now() });
  } else {
    updatePasswordStmt.run(password_hash, Date.now(), admin.id);
  }
}

module.exports = { getPrimaryAdmin, createAdmin, verifyPassword, setPrimaryAdminPassword };
