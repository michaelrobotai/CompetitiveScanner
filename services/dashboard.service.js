'use strict';
const db = require('../config/db');
const env = require('../config/env');

async function overview(query = {}) {
  const minConfidence = parseInt(query.minConfidence, 10) || 0;
  const filters = ["s.status NOT IN ('merged','dismissed')", 's.confidence >= ?'];
  const params = [minConfidence];
  if (query.competitorId) { filters.push('s.competitor_id = ?'); params.push(query.competitorId); }
  if (query.type) { filters.push('s.signal_type = ?'); params.push(query.type); }
  if (query.severity) { filters.push('s.severity = ?'); params.push(query.severity); }
  if (query.from) { filters.push('s.detected_at >= ?'); params.push(`${query.from} 00:00:00`); }
  if (query.to) { filters.push('s.detected_at <= ?'); params.push(`${query.to} 23:59:59`); }

  const cards = await db.query(
    `SELECT s.*, c.name AS competitor_name, c.priority AS competitor_priority
       FROM signals s JOIN competitors c ON c.id = s.competitor_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.detected_at DESC, s.confidence DESC
      LIMIT 18`,
    params
  );

  const kpis = await db.one(
    `SELECT
      (SELECT COUNT(*) FROM competitors WHERE tracking_status='active') AS active_competitors,
      (SELECT COUNT(*) FROM competitors WHERE tracking_status='paused') AS paused_competitors,
      (SELECT COUNT(*) FROM signals WHERE status='new') AS new_signals,
      (SELECT COUNT(*) FROM signals WHERE status <> 'merged' AND severity IN ('critical','high') AND status <> 'dismissed') AS high_signals,
      (SELECT COUNT(*) FROM signals WHERE detected_at >= (NOW() - INTERVAL 7 DAY) AND status <> 'merged') AS signals_7d,
      (SELECT COUNT(*) FROM collected_items WHERE captured_at >= (NOW() - INTERVAL 7 DAY)) AS items_7d,
      (SELECT COUNT(*) FROM collected_items WHERE processing_status='pending') AS items_pending,
      (SELECT ROUND(AVG(confidence)) FROM signals WHERE status <> 'merged') AS avg_confidence`
  );

  const byCategory = await db.query(
    `SELECT signal_type, COUNT(*) AS n, ROUND(AVG(confidence)) AS avg_confidence
       FROM signals WHERE status <> 'merged' GROUP BY signal_type ORDER BY n DESC`
  );

  const topCompetitors = await db.query(
    `SELECT c.id, c.name, c.priority, COUNT(s.id) AS signals, MAX(s.confidence) AS top_confidence,
            MAX(s.detected_at) AS last_signal_at
       FROM competitors c
       LEFT JOIN signals s ON s.competitor_id = c.id AND s.status NOT IN ('merged','dismissed')
      WHERE c.tracking_status <> 'archived'
      GROUP BY c.id, c.name, c.priority
      ORDER BY signals DESC, top_confidence DESC LIMIT 8`
  );

  const lastRun = await db.one(
    `SELECT sr.*, u.full_name AS triggered_by_name FROM scan_runs sr
       LEFT JOIN users u ON u.id = sr.triggered_by
      ORDER BY sr.started_at DESC LIMIT 1`
  );

  const sourceHealth = await db.one(
    `SELECT
       SUM(CASE WHEN last_status='ok' THEN 1 ELSE 0 END) AS ok_count,
       SUM(CASE WHEN last_status IN ('error','rate_limited','robots_blocked') THEN 1 ELSE 0 END) AS failing_count,
       SUM(CASE WHEN last_status='not_configured' THEN 1 ELSE 0 END) AS not_configured_count,
       COUNT(*) AS total_count
     FROM competitor_sources WHERE enabled = 1`
  );

  const recentItems = await db.query(
    `SELECT ci.id, ci.title, ci.connector_key, ci.captured_at, ci.is_mock, c.name AS competitor_name
       FROM collected_items ci JOIN competitors c ON c.id = ci.competitor_id
      ORDER BY ci.captured_at DESC LIMIT 8`
  );

  return {
    cards,
    kpis: kpis || {},
    byCategory,
    topCompetitors,
    lastRun,
    sourceHealth: sourceHealth || {},
    recentItems,
    demoMode: env.demoMode
  };
}

module.exports = { overview };
