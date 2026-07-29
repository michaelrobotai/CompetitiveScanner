'use strict';
const db = require('../config/db');
const { parsePaging, buildPager } = require('../utils/pagination');

const SORTS = {
  captured_at: 'ci.captured_at',
  published_at: 'ci.published_at',
  competitor: 'c.name',
  connector: 'ci.connector_key',
  credibility: 'ci.credibility',
  status: 'ci.processing_status'
};

async function list(query = {}) {
  const { page, perPage, offset } = parsePaging(query, 25);
  const where = [];
  const params = [];
  if (query.competitorId) { where.push('ci.competitor_id = ?'); params.push(query.competitorId); }
  if (query.connector) { where.push('ci.connector_key = ?'); params.push(query.connector); }
  if (query.status) { where.push('ci.processing_status = ?'); params.push(query.status); }
  if (query.changeType) { where.push('ci.change_type = ?'); params.push(query.changeType); }
  if (query.runId) { where.push('ci.scan_run_id = ?'); params.push(query.runId); }
  if (query.onlyMock === '1') where.push('ci.is_mock = 1');
  if (query.from) { where.push('ci.captured_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { where.push('ci.captured_at <= ?'); params.push(`${query.to} 23:59:59`); }
  if (query.q) { where.push('(ci.title LIKE ? OR ci.excerpt LIKE ?)'); params.push(`%${query.q}%`, `%${query.q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortKey = SORTS[query.sort] ? query.sort : 'captured_at';

  const rows = await db.query(
    `SELECT ci.*, c.name AS competitor_name, cs.label AS source_label,
            (SELECT COUNT(*) FROM signal_evidence se WHERE se.collected_item_id = ci.id) AS signal_links
       FROM collected_items ci
       JOIN competitors c ON c.id = ci.competitor_id
       LEFT JOIN competitor_sources cs ON cs.id = ci.source_id
       ${whereSql}
      ORDER BY ${SORTS[sortKey]} ${dir}, ci.id DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  const totalRow = await db.one(
    `SELECT COUNT(*) AS n FROM collected_items ci JOIN competitors c ON c.id = ci.competitor_id ${whereSql}`,
    params
  );
  const connectors = await db.query('SELECT DISTINCT connector_key FROM collected_items ORDER BY connector_key');
  return {
    rows,
    pager: buildPager(Number(totalRow.n), page, perPage),
    connectors: connectors.map((r) => r.connector_key),
    sort: sortKey,
    dir: dir.toLowerCase()
  };
}

async function get(id) {
  const item = await db.one(
    `SELECT ci.*, c.name AS competitor_name, cs.label AS source_label
       FROM collected_items ci
       JOIN competitors c ON c.id = ci.competitor_id
       LEFT JOIN competitor_sources cs ON cs.id = ci.source_id
      WHERE ci.id = ?`,
    [id]
  );
  if (!item) return null;
  const signals = await db.query(
    `SELECT s.id, s.title, s.signal_type, s.confidence, s.severity, s.status
       FROM signal_evidence se JOIN signals s ON s.id = se.signal_id
      WHERE se.collected_item_id = ?`,
    [id]
  );
  return { item, signals };
}

module.exports = { list, get };
