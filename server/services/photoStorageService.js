const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { UPLOADS_DIR } = require('../middleware/upload');

const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'attendance';
let supabase = null;

if (provider === 'supabase') {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
} else if (provider !== 'local') {
  throw new Error(`Unsupported STORAGE_PROVIDER "${provider}". Use "local" or "supabase".`);
}

function isSupabase() {
  return provider === 'supabase';
}

async function save(file) {
  if (!isSupabase()) return file.filename;

  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const objectPath = `attendance/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;
  return objectPath;
}

async function remove(reference) {
  if (!reference) return;
  if (isSupabase()) {
    await supabase.storage.from(bucket).remove([reference]);
    return;
  }
  const filePath = path.resolve(UPLOADS_DIR, reference);
  if (path.dirname(filePath) !== path.resolve(UPLOADS_DIR)) return;
  await fs.promises.unlink(filePath).catch(() => {});
}

async function signedUrl(reference) {
  if (!isSupabase()) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(reference, 60);
  if (error) throw error;
  return data.signedUrl;
}

module.exports = { provider, isSupabase, save, remove, signedUrl };
