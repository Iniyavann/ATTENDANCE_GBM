/**
 * Database connection + automatic migrations.
 *
 * On first run this creates the SQLite file (and its parent folder) and
 * builds every table the app needs. On later runs it just opens the
 * existing file - nothing here ever drops or wipes data.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_FILE = process.env.DB_FILE || './data/gbm-attendance.db';
const resolvedPath = path.resolve(process.cwd(), DB_FILE);

// Make sure the folder for the database file exists.
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS owners (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branch_locations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      address       TEXT DEFAULT '',
      latitude      REAL NOT NULL,
      longitude     REAL NOT NULL,
      radius_meters REAL NOT NULL DEFAULT 100,
      status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      is_default    INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      department  TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'Active',
      branch_id   INTEGER REFERENCES branch_locations(id),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id                     TEXT PRIMARY KEY,
      employee_id            TEXT NOT NULL,
      employee_name          TEXT NOT NULL,
      department             TEXT DEFAULT '',
      date                   TEXT NOT NULL,
      timestamp              INTEGER NOT NULL,
      type                   TEXT NOT NULL CHECK (type IN ('in','out')),
      late_status            TEXT,
      photo_path             TEXT,
      latitude               REAL,
      longitude              REAL,
      accuracy               REAL,
      distance_m             REAL,
      location_verified      INTEGER NOT NULL DEFAULT 0,
      location_verified_at   INTEGER,
      branch_id              INTEGER REFERENCES branch_locations(id),
      branch_name            TEXT,
      created_at             INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

    CREATE TABLE IF NOT EXISTS leave_off (
      id            TEXT PRIMARY KEY,
      employee_id   TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      department    TEXT DEFAULT '',
      date          TEXT NOT NULL,
      status        TEXT NOT NULL,
      leave_info    TEXT,
      reason        TEXT DEFAULT '',
      branch_id     INTEGER REFERENCES branch_locations(id),
      branch_name   TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Add columns to databases created before branch locations existed.
  const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  const addColumn = (table, name, definition) => {
    if (!columns(table).has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  addColumn('employees', 'branch_id', 'INTEGER REFERENCES branch_locations(id)');
  addColumn('attendance', 'branch_id', 'INTEGER REFERENCES branch_locations(id)');
  addColumn('attendance', 'branch_name', 'TEXT');
  addColumn('leave_off', 'branch_id', 'INTEGER REFERENCES branch_locations(id)');
  addColumn('leave_off', 'branch_name', 'TEXT');

  // Seed default settings only if they don't exist yet - never overwrite
  // values an admin has already changed.
  const defaults = {
    companyName: 'GBM',
    officeStartTime: '09:30',
    graceMinutes: '15',
    officeEndTime: '18:30',
    officeLat: String(process.env.OFFICE_LAT || '12.932936802635343'),
    officeLng: String(process.env.OFFICE_LNG || '77.6140108624427'),
    officeRadiusMeters: String(process.env.OFFICE_RADIUS_METERS || '100'),
    softwareStatus: 'on'
  };
  const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const insertDefaults = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (!getStmt.get(key)) insertStmt.run(key, value);
    }
  });
  insertDefaults(Object.entries(defaults));

  // Bootstrap exactly one owner account on first run. The initial password
  // is represented only by a bcrypt hash; deployments may provide a rotated
  // hash through OWNER_PASSWORD_HASH without putting a password in source.
  const ownerCount = db.prepare('SELECT COUNT(*) AS c FROM owners').get().c;
  if (ownerCount === 0) {
    const initialHash = process.env.OWNER_PASSWORD_HASH ||
      '$2a$12$6rw2LooP6ntW7WL5H7/Zv.3FKvObUEezmvU.1Nm0zB376kkRANyjy';
    const now = Date.now();
    db.prepare(`
      INSERT INTO owners (username, password_hash, created_at, updated_at)
      VALUES ('owner', ?, ?, ?)
    `).run(initialHash, now, now);
  }

  // Convert the old single office location into the first/default branch.
  // This is deliberately idempotent so upgrades never create duplicates.
  let defaultBranch = db.prepare('SELECT * FROM branch_locations WHERE is_default = 1 ORDER BY id LIMIT 1').get();
  if (!defaultBranch) {
    defaultBranch = db.prepare('SELECT * FROM branch_locations ORDER BY id LIMIT 1').get();
  }
  if (!defaultBranch) {
    const company = db.prepare('SELECT value FROM settings WHERE key = ?').get('companyName');
    const latValue = Number(db.prepare('SELECT value FROM settings WHERE key = ?').get('officeLat')?.value);
    const lngValue = Number(db.prepare('SELECT value FROM settings WHERE key = ?').get('officeLng')?.value);
    const radiusValue = Number(db.prepare('SELECT value FROM settings WHERE key = ?').get('officeRadiusMeters')?.value);
    const lat = Number.isFinite(latValue) ? latValue : 0;
    const lng = Number.isFinite(lngValue) ? lngValue : 0;
    const radius = Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : 100;
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO branch_locations
        (name, address, latitude, longitude, radius_meters, status, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Active', 1, ?, ?)
    `).run(`${company?.value || 'GBM'} Main Office`, '', lat, lng, radius, now, now);
    defaultBranch = db.prepare('SELECT * FROM branch_locations WHERE id = ?').get(result.lastInsertRowid);
  } else if (!defaultBranch.is_default) {
    db.prepare('UPDATE branch_locations SET is_default = 0').run();
    db.prepare('UPDATE branch_locations SET is_default = 1 WHERE id = ?').run(defaultBranch.id);
    defaultBranch = db.prepare('SELECT * FROM branch_locations WHERE id = ?').get(defaultBranch.id);
  }

  db.prepare('UPDATE employees SET branch_id = ? WHERE branch_id IS NULL').run(defaultBranch.id);
  db.prepare(`
    UPDATE attendance
    SET branch_id = (SELECT branch_id FROM employees WHERE employees.id = attendance.employee_id),
        branch_name = (SELECT name FROM branch_locations WHERE branch_locations.id = (SELECT branch_id FROM employees WHERE employees.id = attendance.employee_id))
    WHERE branch_id IS NULL
  `).run();
  db.prepare(`
    UPDATE leave_off
    SET branch_id = (SELECT branch_id FROM employees WHERE employees.id = leave_off.employee_id),
        branch_name = (SELECT name FROM branch_locations WHERE branch_locations.id = (SELECT branch_id FROM employees WHERE employees.id = leave_off.employee_id))
    WHERE branch_id IS NULL
  `).run();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id, date);
    CREATE INDEX IF NOT EXISTS idx_leave_off_branch_date ON leave_off(branch_id, date);
  `);

  // Seed a few starter employees on a completely fresh database, matching
  // the demo data the original prototype shipped with.
  const empCount = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
  if (empCount === 0) {
    const now = Date.now();
    const insertEmp = db.prepare(`
      INSERT INTO employees (id, name, department, designation, phone, email, status, branch_id, created_at, updated_at)
      VALUES (@id, @name, @department, @designation, @phone, @email, @status, @branch_id, @created_at, @updated_at)
    `);
    const seedEmployees = db.transaction((rows) => rows.forEach(r => insertEmp.run(r)));
    seedEmployees([
      { id: 'GBM001', name: 'Rahul Kumar', department: 'Sales', designation: 'Sales Executive', phone: '', email: '', status: 'Active', branch_id: defaultBranch.id, created_at: now, updated_at: now },
      { id: 'GBM002', name: 'Priya Sharma', department: 'HR', designation: 'HR Executive', phone: '', email: '', status: 'Active', branch_id: defaultBranch.id, created_at: now, updated_at: now },
      { id: 'GBM003', name: 'Amit Verma', department: 'Operations', designation: 'Operations Lead', phone: '', email: '', status: 'Active', branch_id: defaultBranch.id, created_at: now, updated_at: now }
    ]);
  }
}

migrate();

module.exports = db;
