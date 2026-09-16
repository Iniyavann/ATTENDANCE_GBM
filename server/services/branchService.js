const db = require('../database/db');

const selectBase = `
  SELECT id, name, address, latitude, longitude, radius_meters, status,
         is_default, created_at, updated_at
  FROM branch_locations
`;

function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusMeters: Number(row.radius_meters),
    status: row.status,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listBranches() {
  return db.prepare(`${selectBase} ORDER BY is_default DESC, name COLLATE NOCASE ASC`).all().map(toApi);
}

function getBranch(id) {
  const row = db.prepare(`${selectBase} WHERE id = ?`).get(Number(id));
  return toApi(row);
}

function getDefaultBranch() {
  return toApi(db.prepare(`${selectBase} WHERE is_default = 1 ORDER BY id LIMIT 1`).get());
}

function getActiveBranch(id) {
  const branch = getBranch(id);
  return branch && branch.status === 'Active' ? branch : null;
}

function validateInput(input, existing) {
  const name = String(input.name ?? existing?.name ?? '').trim();
  const address = String(input.address ?? existing?.address ?? '').trim();
  const latitude = Number(input.latitude ?? existing?.latitude);
  const longitude = Number(input.longitude ?? existing?.longitude);
  const radiusMeters = Number(input.radiusMeters ?? existing?.radiusMeters ?? 100);
  if (!name) throw Object.assign(new Error('Branch name is required.'), { status: 400 });
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw Object.assign(new Error('A valid latitude is required.'), { status: 400 });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('A valid longitude is required.'), { status: 400 });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw Object.assign(new Error('Radius must be greater than zero.'), { status: 400 });
  }
  return { name, address, latitude, longitude, radiusMeters };
}

function createBranch(input) {
  const values = validateInput(input);
  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO branch_locations
      (name, address, latitude, longitude, radius_meters, status, is_default, created_at, updated_at)
    VALUES (@name, @address, @latitude, @longitude, @radiusMeters, @status, 0, @now, @now)
  `).run({ ...values, status: input.status === 'Inactive' ? 'Inactive' : 'Active', now });
  return getBranch(result.lastInsertRowid);
}

function updateBranch(id, input) {
  const existing = db.prepare('SELECT * FROM branch_locations WHERE id = ?').get(Number(id));
  if (!existing) throw Object.assign(new Error('Branch not found.'), { status: 404 });
  const values = validateInput(input, toApi(existing));
  const status = input.status == null
    ? existing.status
    : (input.status === 'Inactive' ? 'Inactive' : 'Active');
  if (status === 'Inactive' && existing.status === 'Active') {
    const activeCount = db.prepare("SELECT COUNT(*) AS c FROM branch_locations WHERE status = 'Active'").get().c;
    if (activeCount <= 1) throw Object.assign(new Error('At least one branch must remain active.'), { status: 409 });
  }
  db.prepare(`
    UPDATE branch_locations
    SET name=@name, address=@address, latitude=@latitude, longitude=@longitude,
        radius_meters=@radiusMeters, status=@status, updated_at=@now
    WHERE id=@id
  `).run({ ...values, status, now: Date.now(), id: Number(id) });
  return getBranch(id);
}

function deleteBranch(id) {
  const branch = db.prepare('SELECT * FROM branch_locations WHERE id = ?').get(Number(id));
  if (!branch) throw Object.assign(new Error('Branch not found.'), { status: 404 });
  const employeeCount = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE branch_id = ?').get(Number(id)).c;
  if (employeeCount) throw Object.assign(new Error('Reassign employees before deleting this branch.'), { status: 409 });
  const count = db.prepare('SELECT COUNT(*) AS c FROM branch_locations').get().c;
  if (count <= 1) throw Object.assign(new Error('The last branch cannot be deleted.'), { status: 409 });
  const activeCount = db.prepare("SELECT COUNT(*) AS c FROM branch_locations WHERE status = 'Active'").get().c;
  if (branch.status === 'Active' && activeCount <= 1) {
    throw Object.assign(new Error('At least one branch must remain active.'), { status: 409 });
  }
  if (branch.is_default) {
    const replacement = db.prepare("SELECT id FROM branch_locations WHERE id <> ? ORDER BY status = 'Active' DESC, id LIMIT 1").get(Number(id));
    db.prepare('UPDATE branch_locations SET is_default = 1 WHERE id = ?').run(replacement.id);
  }
  db.prepare('DELETE FROM branch_locations WHERE id = ?').run(Number(id));
}

module.exports = {
  listBranches, getBranch, getDefaultBranch, getActiveBranch,
  createBranch, updateBranch, deleteBranch, toApi
};
