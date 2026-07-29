'use strict';
const db = require('../config/db');
const env = require('../config/env');
const registry = require('../collectors/registry');
const audit = require('./audit.service');

const WATCH_TARGETS = ['pricing', 'product', 'careers', 'blog', 'newsroom', 'company', 'executives', 'news', 'jobs', 'funding', 'filings', 'reviews', 'social', 'other'];

async function forCompetitor(competitorId) {
  return db.query('SELECT * FROM competitor_sources WHERE competitor_id = ? ORDER BY connector_key, label', [competitorId]);
}

async function get(id) {
  return db.one('SELECT * FROM competitor_sources WHERE id = ?', [id]);
}

async function create(competitorId, body, actor, ip) {
  const adapter = registry.get(body.connector_key);
  if (!adapter) { const err = new Error('Unknown connector'); err.status = 400; err.expose = true; throw err; }
  const label = String(body.label || adapter.name).trim().slice(0, 150);
  const result = await db.exec(
    `INSERT INTO competitor_sources (competitor_id, connector_key, label, url, watch_target, enabled, check_frequency)
     VALUES (?,?,?,?,?,?,?)`,
    [
      competitorId, adapter.key, label,
      body.url ? String(body.url).trim().slice(0, 500) : null,
      WATCH_TARGETS.includes(body.watch_target) ? body.watch_target : 'other',
      body.enabled === 'off' || body.enabled === false ? 0 : 1,
      ['daily', 'weekly', 'manual'].includes(body.check_frequency) ? body.check_frequency : 'daily'
    ]
  );
  await audit.log({ actor, action: 'create', entityType: 'competitor_source', entityId: result.insertId, entityLabel: label, details: { competitorId, connector: adapter.key, url: body.url || null }, ip });
  return result.insertId;
}

async function update(id, body, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('Source not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec(
    `UPDATE competitor_sources SET label=?, url=?, watch_target=?, enabled=?, check_frequency=? WHERE id=?`,
    [
      String(body.label || existing.label).slice(0, 150),
      body.url ? String(body.url).trim().slice(0, 500) : null,
      WATCH_TARGETS.includes(body.watch_target) ? body.watch_target : existing.watch_target,
      body.enabled === 'off' || body.enabled === false || body.enabled === undefined ? 0 : 1,
      ['daily', 'weekly', 'manual'].includes(body.check_frequency) ? body.check_frequency : existing.check_frequency,
      id
    ]
  );
  await audit.log({ actor, action: 'update', entityType: 'competitor_source', entityId: id, entityLabel: existing.label, details: { url: body.url || null, enabled: body.enabled }, ip });
}

async function toggle(id, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('Source not found'); err.status = 404; err.expose = true; throw err; }
  const next = existing.enabled ? 0 : 1;
  await db.exec('UPDATE competitor_sources SET enabled = ? WHERE id = ?', [next, id]);
  await audit.log({ actor, action: next ? 'enable' : 'disable', entityType: 'competitor_source', entityId: id, entityLabel: existing.label, details: { enabled: Boolean(next) }, ip });
  return next;
}

async function remove(id, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('Source not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec('DELETE FROM competitor_sources WHERE id = ?', [id]);
  await audit.log({ actor, action: 'delete', entityType: 'competitor_source', entityId: id, entityLabel: existing.label, details: { competitorId: existing.competitor_id }, ip });
}

// ── Connectors (integration registry) ──────────────────────────────────────
async function syncConnectors() {
  for (const adapter of registry.list()) {
    const configured = adapter.isConfigured(env);
    const existing = await db.one('SELECT * FROM source_connectors WHERE connector_key = ?', [adapter.key]);
    const status = existing && existing.status === 'disabled'
      ? 'disabled'
      : (configured ? 'configured' : 'not_configured');
    if (existing) {
      await db.exec(
        `UPDATE source_connectors SET name=?, category=?, description=?, auth_type=?, env_key=?,
           credibility_weight=?, rate_limit_per_hour=?, respects_robots=?, status=?, last_checked_at=NOW()
         WHERE connector_key=?`,
        [adapter.name, adapter.category, adapter.description, adapter.authType, adapter.envKey,
          adapter.credibility, adapter.rateLimitPerHour, adapter.respectsRobots ? 1 : 0, status, adapter.key]
      );
    } else {
      await db.exec(
        `INSERT INTO source_connectors (connector_key, name, category, description, auth_type, env_key,
           credibility_weight, rate_limit_per_hour, respects_robots, status, last_checked_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
        [adapter.key, adapter.name, adapter.category, adapter.description, adapter.authType, adapter.envKey,
          adapter.credibility, adapter.rateLimitPerHour, adapter.respectsRobots ? 1 : 0, status]
      );
    }
  }
}

async function listConnectors() {
  const rows = await db.query('SELECT * FROM source_connectors ORDER BY category, name');
  const usage = await db.query(
    `SELECT connector_key, COUNT(*) AS sources,
            SUM(CASE WHEN last_status = 'ok' THEN 1 ELSE 0 END) AS ok_sources,
            SUM(CASE WHEN last_status IN ('error','rate_limited','robots_blocked') THEN 1 ELSE 0 END) AS failing_sources,
            MAX(last_checked_at) AS last_checked_at
       FROM competitor_sources GROUP BY connector_key`
  );
  const byKey = usage.reduce((acc, r) => { acc[r.connector_key] = r; return acc; }, {});
  const itemCounts = await db.query(
    'SELECT connector_key, COUNT(*) AS items FROM collected_items GROUP BY connector_key'
  );
  const items = itemCounts.reduce((acc, r) => { acc[r.connector_key] = Number(r.items); return acc; }, {});
  return rows.map((r) => ({
    ...r,
    usage: byKey[r.connector_key] || { sources: 0, ok_sources: 0, failing_sources: 0, last_checked_at: null },
    itemCount: items[r.connector_key] || 0,
    envConfigured: r.env_key ? Boolean(env.apiKeys[r.env_key]) : true
  }));
}

async function updateConnector(key, body, actor, ip) {
  const existing = await db.one('SELECT * FROM source_connectors WHERE connector_key = ?', [key]);
  if (!existing) { const err = new Error('Connector not found'); err.status = 404; err.expose = true; throw err; }
  const status = ['configured', 'not_configured', 'error', 'disabled'].includes(body.status) ? body.status : existing.status;
  const credibility = Math.max(0, Math.min(100, parseInt(body.credibility_weight, 10) || existing.credibility_weight));
  const rateLimit = Math.max(1, parseInt(body.rate_limit_per_hour, 10) || existing.rate_limit_per_hour);
  const respects = body.respects_robots === undefined || body.respects_robots === 'off' ? 0 : 1;
  await db.exec(
    `UPDATE source_connectors SET status=?, credibility_weight=?, rate_limit_per_hour=?, respects_robots=?,
       config_json=?, updated_by=? WHERE connector_key=?`,
    [status, credibility, rateLimit, respects, body.config_json || existing.config_json, actor ? actor.id : null, key]
  );
  await audit.log({
    actor, action: 'update', entityType: 'connector', entityId: key, entityLabel: existing.name,
    details: { status, credibility, rateLimit, respectsRobots: Boolean(respects) }, ip
  });
}

function adapterCatalog() {
  return registry.list().map((a) => ({
    key: a.key, name: a.name, category: a.category, authType: a.authType,
    envKey: a.envKey, credibility: a.credibility, description: a.description,
    configured: a.isConfigured(env)
  }));
}

module.exports = {
  WATCH_TARGETS, forCompetitor, get, create, update, toggle, remove,
  syncConnectors, listConnectors, updateConnector, adapterCatalog
};
