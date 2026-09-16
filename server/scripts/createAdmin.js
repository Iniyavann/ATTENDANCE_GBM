/**
 * Creates the first (and only) admin account for the attendance portal.
 * Run this once before using the app for the first time:
 *
 *   npm run create-admin
 *
 * It will ask for a passcode and store it securely hashed - the plaintext
 * value is never written to disk or to the frontend.
 */
require('dotenv').config();
const readline = require('readline');
const adminService = require('../services/adminService');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!hidden) {
      rl.question(question, (answer) => { rl.close(); resolve(answer); });
      return;
    }
    // Simple masked input for the passcode.
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(value);
      } else if (char === '\u0003') { // Ctrl+C
        process.exit(1);
      } else if (char === '\u007f') { // backspace
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

(async function main() {
  await require('../database/db').ready;
  const existing = await adminService.getPrimaryAdmin();
  if (existing) {
    console.log(`An admin account ("${existing.username}") already exists. Nothing to do.`);
    console.log('To change the passcode instead, sign in and use the Settings page, or delete the admins row and re-run this script.');
    process.exit(0);
  }

  console.log('Set up the first admin account for GBM Attendance.\n');
  let username = await ask('Admin username [admin]: ');
  username = (username || 'admin').trim();

  let passcode = '';
  while (passcode.length < 4) {
    passcode = await ask('Admin passcode (min 4 characters, input hidden): ', { hidden: true });
    if (passcode.length < 4) console.log('Passcode must be at least 4 characters.\n');
  }

  await adminService.createAdmin(username, passcode);
  console.log(`\nAdmin account "${username}" created. You can now sign in from the app's "Admin sign in" link.`);
  process.exit(0);
})().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
