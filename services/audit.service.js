'use strict';
const db = require('../config/db');
const { parsePaging, buildPager } = require('../utils/pagination');

async function log({ actor, action, entityType, entityId = null, entityLabel = null, details = null, ip = null }) {
  try {
    await db.exec(
      `INSERT INTO audit_logs (user_id, actor_email, actor_role, action, entity_type, entity_id, entity_label, details_json, ip_address)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        actor && actor.id ? actor.id : null,
        actor ? actor.email : null,
        actor ? actor.role : null,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        entityLabel ? String(entityLabel).slice(0, 250) : null,
        details ? JSON.stringify(details).slice(0, 4000) : null,
        ip ? String(ip).slice(0, 60) : null
      ]
    );
  } catch (err) {
    console.error('[audit] failed to write entry', err.message);
  }
}

const SORTS = { created_at: 'al.created_at', action: 'al.action', entity: 'al.entity_type', actor: 'al.actor_email' };

async function list(query = {}) {
  const { page, perPage, offset } = parsePaging(query, 50);
  const where = [];
  const params = [];
  if (query.action) { where.push('al.action = ?'); params.push(query.action); }
  if (query.entityType) { where.push('al.entity_type = ?'); params.push(query.entityType); }
  if (query.userId) { where.push('al.user_id = ?'); params.push(query.userId); }
  if (query.from) { where.push('al.created_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('al.created_at <= ?'); params.push(`${query.to} 23:59:59`); }
  if (query.q) { where.push('(al.entity_label LIKE ? OR al.actor_email LIKE ?)'); params.push(`%${query.q}%`, `%${query.q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortKey = SORTS[query.sort] ? query.sort : 'created_at';

  const rows = await db.query(
    `SELECT al.* FROM audit_logs al ${whereSql}
      ORDER BY ${SORTS[sortKey]} ${dir}, al.id DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  const totalRow = await db.one(`SELECT COUNT(*) AS n FROM audit_logs al ${whereSql}`, params);
  const actions = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  const entities = await db.query('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type');
  return {
    rows,
    pager: buildPager(Number(totalRow.n), page, perPage),
    actions: actions.map((r) => r.action),
    entities: entities.map((r) => r.entity_type),
    sort: sortKey,
    dir: dir.toLowerCase()
  };
}

async function forEntity(entityType, entityId, limit = 20) {
  return db.query(
    'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?',
    [entityType, String(entityId), limit]
  );
}

module.exports = { log, list, forEntity };
