'use strict';
const db = require('../config/db');
const { parsePaging, buildPager } = require('../utils/pagination');
const audit = require('./audit.service');

const SORTS = {
  detected_at: 's.detected_at',
  confidence: 's.confidence',
  impact: 's.impact',
  severity: "FIELD(s.severity,'critical','high','medium','low')",
  competitor: 'c.name',
  type: 's.signal_type'
};

function buildFilters(query) {
  const where = ["s.status <> 'merged'"];
  const params = [];
  if (query.includeMerged === '1') where.length = 0;
  if (query.competitorId) { where.push('s.competitor_id = ?'); params.push(query.competitorId); }
  if (query.type) { where.push('s.signal_type = ?'); params.push(query.type); }
  if (query.severity) { where.push('s.severity = ?'); params.push(query.severity); }
  if (query.status) { where.push('s.status = ?'); params.push(query.status); }
  if (query.minConfidence) { where.push('s.confidence >= ?'); params.push(parseInt(query.minConfidence, 10) || 0); }
  if (query.from) { where.push('s.detected_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('s.detected_at <= ?'); params.push(`${query.to} 23:59:59`); }
  if (query.q) { where.push('(s.title LIKE ? OR s.summary LIKE ?)'); params.push(`%${query.q}%`, `%${query.q}%`); }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function list(query = {}) {
  const { page, perPage, offset } = parsePaging(query, 25);
  const { whereSql, params } = buildFilters(query);
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortKey = SORTS[query.sort] ? query.sort : 'detected_at';

  const rows = await db.query(
    `SELECT s.*, c.name AS competitor_name, c.priority AS competitor_priority, u.full_name AS reviewer_name
       FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
       LEFT JOIN users u ON u.id = s.reviewed_by
       ${whereSql}
      ORDER BY ${SORTS[sortKey]} ${dir}, s.confidence DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  const totalRow = await db.one(
    `SELECT COUNT(*) AS n FROM signals s JOIN competitors c ON c.id = s.competitor_id ${whereSql}`,
    params
  );
  return { rows, pager: buildPager(Number(totalRow.n), page, perPage), sort: sortKey, dir: dir.toLowerCase() };
}

async function feed({ limit = 12, minConfidence = 0, competitorId = null } = {}) {
  const where = ["s.status NOT IN ('merged','dismissed')", 's.confidence >= ?'];
  const params = [minConfidence];
  if (competitorId) { where.push('s.competitor_id = ?'); params.push(competitorId); }
  return db.query(
    `SELECT s.*, c.name AS competitor_name FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.detected_at DESC, s.confidence DESC LIMIT ?`,
    [...params, limit]
  );
}

async function get(id) {
  const signal = await db.one(
    `SELECT s.*, c.name AS competitor_name, c.slug AS competitor_slug, c.website AS competitor_website,
            c.priority AS competitor_priority, u.full_name AS reviewer_name
       FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
       LEFT JOIN users u ON u.id = s.reviewed_by
      WHERE s.id = ?`,
    [id]
  );
  if (!signal) return null;
  const evidence = await db.query(
    `SELECT se.relevance, se.snippet, ci.*
       FROM signal_evidence se
       JOIN collected_items ci ON ci.id = se.collected_item_id
      WHERE se.signal_id = ?
      ORDER BY se.relevance DESC, ci.published_at DESC`,
    [id]
  );
  const notes = await db.query(
    `SELECT n.*, u.full_name AS author_name FROM notes n
       LEFT JOIN users u ON u.id = n.author_id
      WHERE n.signal_id = ? ORDER BY n.created_at DESC`,
    [id]
  );
  const mergedIn = await db.query(
    'SELECT id, title, detected_at, confidence FROM signals WHERE merged_into_id = ? ORDER BY detected_at DESC',
    [id]
  );
  const related = await db.query(
    `SELECT id, title, signal_type, confidence, severity, detected_at FROM signals
      WHERE competitor_id = ? AND id <> ? AND status <> 'merged'
      ORDER BY detected_at DESC LIMIT 6`,
    [signal.competitor_id, id]
  );
  const history = await audit.forEntity('signal', id, 10);
  return { signal, evidence, notes, mergedIn, related, history };
}

async function review(id, { status, note }, actor, ip) {
  const allowed = ['new', 'reviewed', 'confirmed', 'dismissed'];
  if (!allowed.includes(status)) { const err = new Error('Invalid signal status'); err.status = 400; err.expose = true; throw err; }
  const existing = await db.one('SELECT * FROM signals WHERE id = ?', [id]);
  if (!existing) { const err = new Error('Signal not found'); err.status = 404; err.expose = true; throw err; }
  // BR: dismissed signals are retained (never deleted) with reviewer + reason.
  await db.exec(
    'UPDATE signals SET status=?, reviewed_by=?, reviewed_at=NOW(), review_note=? WHERE id=?',
    [status, actor ? actor.id : null, note ? String(note).slice(0, 2000) : existing.review_note, id]
  );
  await audit.log({
    actor, action: `signal_${status}`, entityType: 'signal', entityId: id,
    entityLabel: existing.title, details: { from: existing.status, to: status, note: note || null }, ip
  });
}

async function merge(sourceId, targetId, actor, ip) {
  if (String(sourceId) === String(targetId)) {
    const err = new Error('Cannot merge a signal into itself'); err.status = 400; err.expose = true; throw err;
  }
  const source = await db.one('SELECT * FROM signals WHERE id = ?', [sourceId]);
  const target = await db.one('SELECT * FROM signals WHERE id = ?', [targetId]);
  if (!source || !target) { const err = new Error('Signal not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec(
    `INSERT IGNORE INTO signal_evidence (signal_id, collected_item_id, relevance, snippet)
       SELECT ?, collected_item_id, relevance, snippet FROM signal_evidence WHERE signal_id = ?`,
    [targetId, sourceId]
  );
  await db.exec("UPDATE signals SET status='merged', merged_into_id=?, reviewed_by=?, reviewed_at=NOW() WHERE id=?",
    [targetId, actor ? actor.id : null, sourceId]);
  const countRow = await db.one('SELECT COUNT(*) AS n FROM signal_evidence WHERE signal_id = ?', [targetId]);
  const srcRow = await db.one(
    `SELECT COUNT(DISTINCT ci.connector_key) AS n FROM signal_evidence se
       JOIN collected_items ci ON ci.id = se.collected_item_id WHERE se.signal_id = ?`,
    [targetId]
  );
  await db.exec(
    'UPDATE signals SET evidence_count = ?, corroborating_sources = ?, confidence = GREATEST(confidence, ?) WHERE id = ?',
    [Number(countRow.n), Number(srcRow.n), source.confidence, targetId]
  );
  await audit.log({
    actor, action: 'signal_merged', entityType: 'signal', entityId: sourceId,
    entityLabel: source.title, details: { mergedInto: targetId }, ip
  });
}

async function categoryCounts(query = {}) {
  const { whereSql, params } = buildFilters(query);
  return db.query(
    `SELECT s.signal_type, COUNT(*) AS n FROM signals s
       JOIN competitors c ON c.id = s.competitor_id ${whereSql}
      GROUP BY s.signal_type`,
    params
  );
}

module.exports = { list, feed, get, review, merge, categoryCounts };
