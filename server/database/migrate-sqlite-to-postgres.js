/**
 * Idempotently copies an existing SQLite database into PostgreSQL.
 * Usage: DATABASE_URL=... DB_FILE=... node server/database/migrate-sqlite-to-postgres.js
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const file = path.resolve(process.cwd(), process.env.DB_FILE || './data/gbm-attendance.db');
  if (!fs.existsSync(file)) throw new Error(`SQLite database not found: ${file}`);
  const source = new Database(file, { readonly: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false } });
  const useSupabaseStorage = (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'supabase';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'attendance';
  let storage = null;
  if (useSupabaseStorage) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for photo migration.');
    }
    storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  const uploadsDir = path.resolve(process.cwd(), process.env.UPLOADS_DIR || './uploads/attendance');
  const tables = ['admins', 'owners', 'branch_locations', 'employees', 'attendance', 'leave_off', 'settings'];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of tables) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const quoted = columns.map(c => `"${c}"`).join(',');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
      for (const row of rows) {
        const imported = { ...row };
        if (table === 'attendance' && imported.photo_path && storage) {
          const localPath = path.resolve(uploadsDir, imported.photo_path);
          if (path.dirname(localPath) !== uploadsDir || !fs.existsSync(localPath)) {
            console.warn(`Photo file not found for attendance ${imported.id}; preserving the attendance record without its photo.`);
            imported.photo_path = null;
          } else {
            const ext = path.extname(localPath).toLowerCase() || '.jpg';
            const objectPath = `attendance/migrated-${imported.id}-${crypto.randomBytes(6).toString('hex')}${ext}`;
            const upload = await storage.storage.from(bucket).upload(objectPath, fs.readFileSync(localPath), {
              contentType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
              upsert: false
            });
            if (upload.error) throw upload.error;
            imported.photo_path = objectPath;
          }
        }
        await client.query(`INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, columns.map(c => imported[c]));
      }
    }
    // Reset every SERIAL sequence, including tables that had no imported rows.
    for (const table of ['admins', 'owners', 'branch_locations']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), EXISTS (SELECT 1 FROM ${table}) )`);
    }
    await client.query('COMMIT');
    console.log('SQLite data migrated to PostgreSQL.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    source.close();
  }
})().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; });
