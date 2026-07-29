'use strict';
const db = require('../config/db');
const { hashPassword } = require('../utils/hash');
const audit = require('./audit.service');

const ROLES = ['admin', 'analyst', 'viewer'];

async function list() {
  return db.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.job_title, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM signals s WHERE s.reviewed_by = u.id) AS signals_reviewed
       FROM users u ORDER BY FIELD(u.role,'admin','analyst','viewer'), u.full_name`
  );
}

async function get(id) {
  return db.one('SELECT id, full_name, email, role, status, job_title, last_login_at, created_at FROM users WHERE id = ?', [id]);
}

async function create(body, actor, ip) {
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.full_name || '').trim();
  const role = ROLES.includes(body.role) ? body.role : 'viewer';
  if (!email || !email.includes('@')) { const err = new Error('A valid email is required'); err.status = 400; err.expose = true; throw err; }
  if (!fullName) { const err = new Error('Full name is required'); err.status = 400; err.expose = true; throw err; }
  if (!body.password || String(body.password).length < 6) {
    const err = new Error('Password must be at least 6 characters'); err.status = 400; err.expose = true; throw err;
  }
  const dup = await db.one('SELECT id FROM users WHERE email = ?', [email]);
  if (dup) { const err = new Error('A user with that email already exists'); err.status = 400; err.expose = true; throw err; }

  const hash = await hashPassword(body.password);
  const result = await db.exec(
    'INSERT INTO users (full_name, email, password_hash, role, status, job_title) VALUES (?,?,?,?,?,?)',
    [fullName, email, hash, role, body.status === 'suspended' ? 'suspended' : 'active', body.job_title || null]
  );
  await audit.log({ actor, action: 'create', entityType: 'user', entityId: result.insertId, entityLabel: email, details: { role, fullName }, ip });
  return result.insertId;
}

async function update(id, body, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('User not found'); err.status = 404; err.expose = true; throw err; }
  const role = ROLES.includes(body.role) ? body.role : existing.role;
  const status = body.status === 'suspended' ? 'suspended' : 'active';

  if (existing.role === 'admin' && role !== 'admin') {
    const admins = await db.one("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'");
    if (Number(admins.n) <= 1) {
      const err = new Error('Cannot remove the last active administrator'); err.status = 400; err.expose = true; throw err;
    }
  }

  await db.exec(
    'UPDATE users SET full_name=?, role=?, status=?, job_title=? WHERE id=?',
    [String(body.full_name || existing.full_name).trim(), role, status, body.job_title || null, id]
  );
  if (body.password && String(body.password).trim()) {
    if (String(body.password).length < 6) {
      const err = new Error('Password must be at least 6 characters'); err.status = 400; err.expose = true; throw err;
    }
    await db.exec('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.password), id]);
  }
  await audit.log({
    actor, action: 'update', entityType: 'user', entityId: id, entityLabel: existing.email,
    details: { roleFrom: existing.role, roleTo: role, statusFrom: existing.status, statusTo: status, passwordChanged: Boolean(body.password) }, ip
  });
}

async function remove(id, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('User not found'); err.status = 404; err.expose = true; throw err; }
  if (actor && String(actor.id) === String(id)) {
    const err = new Error('You cannot delete your own account'); err.status = 400; err.expose = true; throw err;
  }
  if (existing.role === 'admin') {
    const admins = await db.one("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'");
    if (Number(admins.n) <= 1) {
      const err = new Error('Cannot delete the last active administrator'); err.status = 400; err.expose = true; throw err;
    }
  }
  await db.exec('DELETE FROM users WHERE id = ?', [id]);
  await audit.log({ actor, action: 'delete', entityType: 'user', entityId: id, entityLabel: existing.email, details: { role: existing.role }, ip });
}

module.exports = { ROLES, list, get, create, update, remove };
