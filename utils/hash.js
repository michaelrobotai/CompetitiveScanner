'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(String(plain), String(hash));
  } catch (_) {
    return false;
  }
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input == null ? '' : input), 'utf8').digest('hex');
}

module.exports = { hashPassword, verifyPassword, sha256 };
