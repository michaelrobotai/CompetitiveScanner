'use strict';
const db = require('../config/db');
const { verifyPassword } = require('../utils/hash');

async function authenticate(email, password) {
  const user = await db.one('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email || '').trim().toLowerCase()]);
  if (!user) return { ok: false, reason: 'invalid' };
  if (user.status !== 'active') return { ok: false, reason: 'suspended' };
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return { ok: false, reason: 'invalid' };
  await db.exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      jobTitle: user.job_title
    }
  };
}

async function demoAccounts() {
  return db.query(
    "SELECT full_name, email, role FROM users WHERE email LIKE '%@radar.demo' AND status = 'active' ORDER BY FIELD(role,'admin','analyst','viewer')"
  );
}

module.exports = { authenticate, demoAccounts };
