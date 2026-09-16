const bcrypt = require('bcryptjs');
const db = require('../database/db');

const ownerStmt = db.prepare('SELECT * FROM owners ORDER BY id ASC LIMIT 1');
const updatePasswordStmt = db.prepare(
  'UPDATE owners SET password_hash = ?, updated_at = ? WHERE id = ?'
);
const SALT_ROUNDS = 12;

function getOwner() {
  return ownerStmt.get();
}

function verifyPassword(plainPassword) {
  const owner = getOwner();
  return !!owner && bcrypt.compareSync(plainPassword, owner.password_hash);
}

function changePassword(currentPassword, newPassword) {
  const owner = getOwner();
  if (!owner || !bcrypt.compareSync(currentPassword, owner.password_hash)) {
    const err = new Error('Current owner password is incorrect.');
    err.status = 401;
    throw err;
  }
  const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  updatePasswordStmt.run(passwordHash, Date.now(), owner.id);
}

module.exports = { getOwner, verifyPassword, changePassword };
