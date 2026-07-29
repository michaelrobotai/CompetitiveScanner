'use strict';
const db = require('../config/db');
const audit = require('./audit.service');
const { SIGNAL_TYPES, fmtDate } = require('../utils/format');

function range(query) {
  const to = query.to || new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const from = query.from || fromDefault;
  return { from, to };
}

async function generate(query = {}) {
  const { from, to } = range(query);
  const competitorId = query.competitorId ? parseInt(query.competitorId, 10) : null;
  const params = [`${from} 00:00:00`, `${to} 23:59:59`];
  let scope = 's.detected_at BETWEEN ? AND ?';
  if (competitorId) { scope += ' AND s.competitor_id = ?'; params.push(competitorId); }

  const totals = await db.one(
    `SELECT COUNT(*) AS signals_total,
            SUM(CASE WHEN s.severity IN ('critical','high') THEN 1 ELSE 0 END) AS high_severity,
            SUM(CASE WHEN s.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN s.status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed,
            SUM(CASE WHEN s.status = 'new' THEN 1 ELSE 0 END) AS pending,
            ROUND(AVG(s.confidence)) AS avg_confidence,
            MAX(s.confidence) AS max_confidence
       FROM signals s WHERE ${scope} AND s.status <> 'merged'`,
    params
  );

  const byCategory = await db.query(
    `SELECT s.signal_type, COUNT(*) AS n, ROUND(AVG(s.confidence)) AS avg_confidence,
            SUM(CASE WHEN s.severity IN ('critical','high') THEN 1 ELSE 0 END) AS high_count
       FROM signals s WHERE ${scope} AND s.status <> 'merged'
      GROUP BY s.signal_type ORDER BY n DESC`,
    params
  );

  const byCompetitor = await db.query(
    `SELECT c.id, c.name, c.priority, COUNT(s.id) AS signals,
            ROUND(AVG(s.confidence)) AS avg_confidence, MAX(s.confidence) AS top_confidence,
            SUM(CASE WHEN s.severity IN ('critical','high') THEN 1 ELSE 0 END) AS high_count,
            MAX(s.detected_at) AS last_signal_at
       FROM competitors c
       LEFT JOIN signals s ON s.competitor_id = c.id AND s.status <> 'merged' AND s.detected_at BETWEEN ? AND ?
      ${competitorId ? 'WHERE c.id = ?' : ''}
      GROUP BY c.id, c.name, c.priority
      ORDER BY signals DESC, c.name ASC`,
    competitorId ? [`${from} 00:00:00`, `${to} 23:59:59`, competitorId] : [`${from} 00:00:00`, `${to} 23:59:59`]
  );

  const timeline = await db.query(
    `SELECT DATE(s.detected_at) AS day, COUNT(*) AS n
       FROM signals s WHERE ${scope} AND s.status <> 'merged'
      GROUP BY DATE(s.detected_at) ORDER BY day ASC`,
    params
  );

  const topSignals = await db.query(
    `SELECT s.*, c.name AS competitor_name FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
      WHERE ${scope} AND s.status <> 'merged'
      ORDER BY s.confidence DESC, s.impact DESC LIMIT 20`,
    params
  );

  const sourceMix = await db.query(
    `SELECT ci.connector_key, COUNT(DISTINCT ci.id) AS items, COUNT(DISTINCT se.signal_id) AS signals
       FROM collected_items ci
       LEFT JOIN signal_evidence se ON se.collected_item_id = ci.id
      WHERE ci.captured_at BETWEEN ? AND ? ${competitorId ? 'AND ci.competitor_id = ?' : ''}
      GROUP BY ci.connector_key ORDER BY items DESC`,
    competitorId ? [`${from} 00:00:00`, `${to} 23:59:59`, competitorId] : [`${from} 00:00:00`, `${to} 23:59:59`]
  );

  const runStats = await db.one(
    `SELECT COUNT(*) AS runs, SUM(items_collected) AS items, SUM(signals_created) AS signals,
            SUM(sources_failed) AS failures, ROUND(AVG(duration_ms)) AS avg_duration
       FROM scan_runs WHERE started_at BETWEEN ? AND ?`,
    [`${from} 00:00:00`, `${to} 23:59:59`]
  );

  const competitor = competitorId ? await db.one('SELECT * FROM competitors WHERE id = ?', [competitorId]) : null;

  return {
    from, to, competitorId, competitor,
    totals: totals || {}, byCategory, byCompetitor, timeline, topSignals, sourceMix,
    runStats: runStats || {},
    reportType: competitorId ? 'per_competitor' : 'cross_competitor'
  };
}

async function save(report, actor, ip) {
  const name = report.competitor
    ? `${report.competitor.name} — ${report.from} to ${report.to}`
    : `Cross-competitor — ${report.from} to ${report.to}`;
  const result = await db.exec(
    `INSERT INTO reports (name, report_type, competitor_id, date_from, date_to, filters_json, summary_json, generated_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name, report.reportType, report.competitorId, report.from, report.to,
      JSON.stringify({ competitorId: report.competitorId }),
      JSON.stringify({ totals: report.totals, byCategory: report.byCategory, byCompetitor: report.byCompetitor }).slice(0, 4000000),
      actor ? actor.id : null
    ]
  );
  await audit.log({ actor, action: 'generate_report', entityType: 'report', entityId: result.insertId, entityLabel: name, details: { from: report.from, to: report.to }, ip });
  return result.insertId;
}

async function listSaved(limit = 20) {
  return db.query(
    `SELECT r.*, u.full_name AS generated_by_name, c.name AS competitor_name
       FROM reports r
       LEFT JOIN users u ON u.id = r.generated_by
       LEFT JOIN competitors c ON c.id = r.competitor_id
      ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );
}

function toCsv(report) {
  const esc = (v) => {
    const s = String(v == null ? '' : v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [];
  lines.push(`Competitive Radar report,${report.from} to ${report.to}`);
  lines.push(`Scope,${report.competitor ? report.competitor.name : 'All competitors'}`);
  lines.push('');
  lines.push('Summary');
  lines.push('Metric,Value');
  lines.push(`Total signals,${report.totals.signals_total || 0}`);
  lines.push(`High severity,${report.totals.high_severity || 0}`);
  lines.push(`Confirmed,${report.totals.confirmed || 0}`);
  lines.push(`Dismissed,${report.totals.dismissed || 0}`);
  lines.push(`Pending review,${report.totals.pending || 0}`);
  lines.push(`Average confidence,${report.totals.avg_confidence || 0}`);
  lines.push('');
  lines.push('Signals by category');
  lines.push('Category,Count,Avg confidence,High severity');
  report.byCategory.forEach((r) => {
    lines.push([esc(SIGNAL_TYPES[r.signal_type] ? SIGNAL_TYPES[r.signal_type].label : r.signal_type), r.n, r.avg_confidence || 0, r.high_count || 0].join(','));
  });
  lines.push('');
  lines.push('Signals by competitor');
  lines.push('Competitor,Priority,Signals,Avg confidence,Top confidence,High severity,Last signal');
  report.byCompetitor.forEach((r) => {
    lines.push([esc(r.name), r.priority, r.signals || 0, r.avg_confidence || 0, r.top_confidence || 0, r.high_count || 0, r.last_signal_at ? fmtDate(r.last_signal_at) : ''].join(','));
  });
  lines.push('');
  lines.push('Top signals');
  lines.push('Competitor,Title,Category,Confidence,Impact,Severity,Status,Detected');
  report.topSignals.forEach((s) => {
    lines.push([
      esc(s.competitor_name), esc(s.title),
      esc(SIGNAL_TYPES[s.signal_type] ? SIGNAL_TYPES[s.signal_type].label : s.signal_type),
      s.confidence, s.impact, s.severity, s.status, fmtDate(s.detected_at)
    ].join(','));
  });
  lines.push('');
  lines.push('Source mix');
  lines.push('Connector,Items collected,Signals contributed');
  report.sourceMix.forEach((r) => lines.push([esc(r.connector_key), r.items, r.signals].join(',')));
  return lines.join('\n');
}

module.exports = { generate, save, listSaved, toCsv, range };
