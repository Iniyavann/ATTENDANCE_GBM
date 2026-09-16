/**
 * Async database facade.  SQLite remains the zero-configuration default;
 * DATABASE_URL selects a node-postgres pool.  Keeping the small facade here
 * means services never need to know which driver is in use.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const isPostgres = Boolean(process.env.DATABASE_URL);
let sqlite;
let pool;

function sqliteParams(sql, params) {
  if (!params || Array.isArray(params)) return { sql, params: params || [] };
  const values = [];
  const converted = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => {
    values.push(params[key]);
    return '?';
  });
  return { sql: converted, params: values };
}
function pgParams(sql, params) {
  const values = [];
  let converted = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)|\?/g, (match, key) => {
    values.push(key ? params[key] : params.shift());
    return `$${values.length}`;
  });
  // SQLite's COLLATE NOCASE has no PostgreSQL equivalent.
  converted = converted.replace(/\s+COLLATE\s+NOCASE/gi, '');
  return { sql: converted, params: values };
}

async function get(sql, params = []) {
  if (isPostgres) {
    const p = Array.isArray(params) ? [...params] : params;
    const q = pgParams(sql, p);
    const result = await pool.query(q.sql, q.params);
    return result.rows[0];
  }
  const q = sqliteParams(sql, params);
  return sqlite.prepare(q.sql).get(...q.params);
}
async function all(sql, params = []) {
  if (isPostgres) {
    const p = Array.isArray(params) ? [...params] : params;
    const q = pgParams(sql, p);
    return (await pool.query(q.sql, q.params)).rows;
  }
  const q = sqliteParams(sql, params);
  return sqlite.prepare(q.sql).all(...q.params);
}
async function run(sql, params = []) {
  if (isPostgres) {
    const p = Array.isArray(params) ? [...params] : params;
    const q = pgParams(sql, p);
    const result = await pool.query(q.sql, q.params);
    return { changes: result.rowCount, rows: result.rows, lastInsertRowid: result.rows[0]?.id };
  }
  const q = sqliteParams(sql, params);
  const result = sqlite.prepare(q.sql).run(...q.params);
  return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
}

async function transaction(callback) {
  if (isPostgres) {
    const client = await pool.connect();
    const tx = { get: async (sql, p) => (await client.query(...Object.values(pgParams(sql, Array.isArray(p) ? [...p] : p || {})))).rows[0], all: async (sql, p) => (await client.query(...Object.values(pgParams(sql, Array.isArray(p) ? [...p] : p || {})))).rows, run: async (sql, p) => { const q = pgParams(sql, Array.isArray(p) ? [...p] : p || {}); const r = await client.query(q.sql, q.params); return { changes: r.rowCount, rows: r.rows, lastInsertRowid: r.rows[0]?.id }; } };
    await client.query('BEGIN');
    try { const result = await callback(tx); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const tx = {
    get: (sql, p = []) => { const q = sqliteParams(sql, p); return sqlite.prepare(q.sql).get(...q.params); },
    all: (sql, p = []) => { const q = sqliteParams(sql, p); return sqlite.prepare(q.sql).all(...q.params); },
    run: (sql, p = []) => { const q = sqliteParams(sql, p); const r = sqlite.prepare(q.sql).run(...q.params); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }; }
  };
  return sqlite.transaction(() => callback(tx))();
}

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owners (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS branch_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT DEFAULT '', latitude REAL NOT NULL, longitude REAL NOT NULL, radius_meters REAL NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'Active', is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, department TEXT DEFAULT '', designation TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', branch_id INTEGER REFERENCES branch_locations(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, department TEXT DEFAULT '', date TEXT NOT NULL, timestamp INTEGER NOT NULL, type TEXT NOT NULL, late_status TEXT, photo_path TEXT, latitude REAL, longitude REAL, accuracy REAL, distance_m REAL, location_verified INTEGER NOT NULL DEFAULT 0, location_verified_at INTEGER, branch_id INTEGER REFERENCES branch_locations(id), branch_name TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS leave_off (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, department TEXT DEFAULT '', date TEXT NOT NULL, status TEXT NOT NULL, leave_info TEXT, reason TEXT DEFAULT '', branch_id INTEGER REFERENCES branch_locations(id), branch_name TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(employee_id,date));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id,date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id,date);
CREATE INDEX IF NOT EXISTS idx_leave_off_branch_date ON leave_off(branch_id,date);
`;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS owners (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS branch_locations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, address TEXT DEFAULT '', latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, radius_meters DOUBLE PRECISION NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'Active', is_default INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, department TEXT DEFAULT '', designation TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', branch_id INTEGER REFERENCES branch_locations(id), created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, department TEXT DEFAULT '', date TEXT NOT NULL, timestamp BIGINT NOT NULL, type TEXT NOT NULL, late_status TEXT, photo_path TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, accuracy DOUBLE PRECISION, distance_m DOUBLE PRECISION, location_verified INTEGER NOT NULL DEFAULT 0, location_verified_at BIGINT, branch_id INTEGER REFERENCES branch_locations(id), branch_name TEXT, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS leave_off (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, employee_name TEXT NOT NULL, department TEXT DEFAULT '', date TEXT NOT NULL, status TEXT NOT NULL, leave_info TEXT, reason TEXT DEFAULT '', branch_id INTEGER REFERENCES branch_locations(id), branch_name TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, UNIQUE(employee_id,date));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branch_locations(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branch_locations(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE leave_off ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branch_locations(id);
ALTER TABLE leave_off ADD COLUMN IF NOT EXISTS branch_name TEXT;
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id,date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id,date);
CREATE INDEX IF NOT EXISTS idx_leave_off_branch_date ON leave_off(branch_id,date);
`;

async function migrate() {
  if (isPostgres) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false } });
    const client = await pool.connect();
    const tx = {
      get: async (sql, params = []) => {
        const q = pgParams(sql, Array.isArray(params) ? [...params] : params);
        return (await client.query(q.sql, q.params)).rows[0];
      },
      all: async (sql, params = []) => {
        const q = pgParams(sql, Array.isArray(params) ? [...params] : params);
        return (await client.query(q.sql, q.params)).rows;
      },
      run: async (sql, params = []) => {
        const q = pgParams(sql, Array.isArray(params) ? [...params] : params);
        const result = await client.query(q.sql, q.params);
        return { changes: result.rowCount, rows: result.rows, lastInsertRowid: result.rows[0]?.id };
      }
    };
    try { await client.query('BEGIN'); await client.query(PG_SCHEMA); await seed(tx); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } else {
    const file = path.resolve(process.cwd(), process.env.DB_FILE || './data/gbm-attendance.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    sqlite = new Database(file);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(SQLITE_SCHEMA);
    await seed();
  }
}
async function seed(executor = { get, run }) {
  const queryGet = executor.get;
  const queryRun = executor.run;
  const defaults = { companyName: 'GBM', officeStartTime: '09:30', graceMinutes: '15', officeEndTime: '18:30', officeLat: process.env.OFFICE_LAT || '12.932936802635343', officeLng: process.env.OFFICE_LNG || '77.6140108624427', officeRadiusMeters: process.env.OFFICE_RADIUS_METERS || '100', softwareStatus: 'on' };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(await queryGet('SELECT value FROM settings WHERE key = ?', [key]))) await queryRun('INSERT INTO settings (key,value) VALUES (?,?)', [key, String(value)]);
  }
  if (!(await queryGet('SELECT id FROM admins ORDER BY id LIMIT 1'))) {
    await queryRun('INSERT INTO admins (username,password_hash,created_at,updated_at) VALUES (?,?,?,?)', ['admin', '$2a$12$f.go1.S9VOdp9d9.wV.knOQLIaNVLOH4C9GP.DUR5jSPAyMOzxQjO', Date.now(), Date.now()]);
  }
  if (!(await queryGet('SELECT id FROM owners ORDER BY id LIMIT 1'))) {
    await queryRun('INSERT INTO owners (username,password_hash,created_at,updated_at) VALUES (?,?,?,?)', ['owner', '$2a$12$Ictg4X51zHLM0jztEToBT.0gVHoHtqmIFcmE.qrXbm74frPs1ryLe', Date.now(), Date.now()]);
  }
  let branch = await queryGet('SELECT * FROM branch_locations WHERE is_default = 1 ORDER BY id LIMIT 1') || await queryGet('SELECT * FROM branch_locations ORDER BY id LIMIT 1');
  if (!branch) {
    const company = await queryGet('SELECT value FROM settings WHERE key = ?', ['companyName']);
    const result = await queryRun('INSERT INTO branch_locations (name,address,latitude,longitude,radius_meters,status,is_default,created_at,updated_at) VALUES (?,?,?,?,? ,?,1,?,?)', [`${company?.value || 'GBM'} Main Office`, '', Number(defaults.officeLat), Number(defaults.officeLng), Number(defaults.officeRadiusMeters), 'Active', Date.now(), Date.now()]);
    branch = await queryGet('SELECT * FROM branch_locations WHERE id = ?', [result.lastInsertRowid || (await queryGet('SELECT MAX(id) id FROM branch_locations')).id]);
  }
  await queryRun('UPDATE employees SET branch_id = ? WHERE branch_id IS NULL', [branch.id]);
  if (!(await queryGet('SELECT id FROM employees LIMIT 1'))) {
    const now = Date.now();
    for (const e of [['GBM001','Rahul Kumar','Sales','Sales Executive'],['GBM002','Priya Sharma','HR','HR Executive'],['GBM003','Amit Verma','Operations','Operations Lead']])
      await queryRun('INSERT INTO employees (id,name,department,designation,phone,email,status,branch_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [e[0],e[1],e[2],e[3],'','', 'Active', branch.id, now, now]);
  }
}

const ready = migrate();
module.exports = { get, all, run, transaction, ready, isPostgres, pool: () => pool };
