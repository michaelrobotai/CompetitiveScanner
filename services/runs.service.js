'use strict';
const db = require('../config/db');
const env = require('../config/env');
const registry = require('../collectors/registry');
const { fetchPage } = require('../collectors/fetcher');
const { STATUS } = require('../collectors/adapters/base');
const analysis = require('./analysis.service');
const digest = require('./digest.service');
const audit = require('./audit.service');
const { parsePaging, buildPager } = require('../utils/pagination');

let runningPromise = null;

async function createRun({ runType, competitorId = null, triggeredBy = null }) {
  const result = await db.exec(
    `INSERT INTO scan_runs (run_type, status, competitor_id, triggered_by, started_at)
     VALUES (?, 'running', ?, ?, NOW())`,
    [runType, competitorId, triggeredBy]
  );
  return result.insertId;
}

async function selectCompetitors({ runType, competitorId }) {
  if (competitorId) {
    // Manual single-competitor runs may target a paused competitor deliberately.
    return db.query("SELECT * FROM competitors WHERE id = ? AND tracking_status <> 'archived'", [competitorId]);
  }
  if (runType === 'scheduled') {
    // BR: scheduled runs skip paused/archived competitors.
    return db.query("SELECT * FROM competitors WHERE tracking_status = 'active' ORDER BY priority, name");
  }
  return db.query("SELECT * FROM competitors WHERE tracking_status IN ('active','paused') ORDER BY priority, name");
}

async function runScan({ runType = 'manual_all', competitorId = null, triggeredBy = null, actor = null, onlyFailed = false }) {
  if (runningPromise) {
    const err = new Error('A scan run is already in progress. Please wait for it to finish.');
    err.status = 409;
    err.expose = true;
    throw err;
  }
  const runId = await createRun({ runType, competitorId, triggeredBy });
  runningPromise = execute({ runId, runType, competitorId, onlyFailed })
    .catch(async (err) => {
      console.error('[scan] run failed', err);
      await db.exec(
        `UPDATE scan_runs SET status='failed', finished_at=NOW(),
           duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW())/1000,
           error_summary = ? WHERE id = ?`,
        [String(err.message || err).slice(0, 2000), runId]
      );
      return { runId, status: 'failed', error: String(err.message || err) };
    })
    .finally(() => { runningPromise = null; });

  if (actor) {
    await audit.log({
      actor,
      action: 'trigger_scan',
      entityType: 'scan_run',
      entityId: runId,
      entityLabel: competitorId ? `Manual run for competitor #${competitorId}` : `Manual run (${runType})`,
      details: { runType, competitorId, onlyFailed }
    });
  }
  return runningPromise;
}

async function execute({ runId, runType, competitorId, onlyFailed }) {
  const started = Date.now();
  const competitors = await selectCompetitors({ runType, competitorId });
  const perSource = [];
  const counters = { total: 0, ok: 0, failed: 0, notConfigured: 0, skipped: 0, items: 0 };
  const errors = [];

  for (const competitor of competitors) {
    let sourceRows = await db.query(
      'SELECT * FROM competitor_sources WHERE competitor_id = ? ORDER BY id',
      [competitor.id]
    );
    if (onlyFailed) {
      sourceRows = sourceRows.filter((s) => ['error', 'rate_limited', 'robots_blocked'].includes(s.last_status));
    }

    for (const source of sourceRows) {
      counters.total += 1;
      const entry = {
        competitorId: competitor.id,
        competitor: competitor.name,
        sourceId: source.id,
        source: source.label,
        connector: source.connector_key,
        status: null,
        items: 0,
        note: null,
        error: null,
        durationMs: 0
      };
      const t0 = Date.now();

      if (!source.enabled) {
        entry.status = STATUS.SKIPPED;
        entry.note = 'Source disabled';
        counters.skipped += 1;
        await updateSource(source.id, entry.status, entry.note, null);
        entry.durationMs = Date.now() - t0;
        perSource.push(entry);
        continue;
      }
      if (runType === 'scheduled' && source.check_frequency === 'manual') {
        entry.status = STATUS.SKIPPED;
        entry.note = 'Source is manual-only; skipped by scheduled run';
        counters.skipped += 1;
        entry.durationMs = Date.now() - t0;
        perSource.push(entry);
        continue;
      }

      const adapter = registry.get(source.connector_key);
      if (!adapter) {
        entry.status = STATUS.ERROR;
        entry.error = `No adapter registered for connector "${source.connector_key}"`;
        counters.failed += 1;
        errors.push(`${competitor.name} / ${source.label}: ${entry.error}`);
        await updateSource(source.id, entry.status, entry.error, null, true);
        entry.durationMs = Date.now() - t0;
        perSource.push(entry);
        continue;
      }

      const connectorRow = await db.one('SELECT * FROM source_connectors WHERE connector_key = ?', [source.connector_key]);
      if (connectorRow && connectorRow.status === 'disabled') {
        entry.status = STATUS.SKIPPED;
        entry.note = 'Connector disabled by administrator';
        counters.skipped += 1;
        await updateSource(source.id, entry.status, entry.note, null);
        entry.durationMs = Date.now() - t0;
        perSource.push(entry);
        continue;
      }

      let outcome;
      try {
        outcome = await adapter.collect({
          competitor,
          source,
          env,
          demoMode: env.demoMode,
          fetchPage,
          now: new Date()
        });
      } catch (err) {
        outcome = { status: STATUS.ERROR, items: [], error: String(err.message || err) };
      }

      entry.status = outcome.status;
      entry.note = outcome.note || null;
      entry.error = outcome.error || null;

      if (outcome.status === STATUS.OK) {
        const inserted = await persistItems({
          competitor, source, runId, items: outcome.items || [], connectorKey: source.connector_key
        });
        entry.items = inserted;
        counters.items += inserted;
        counters.ok += 1;
        await updateSource(source.id, STATUS.OK, null, outcome.newContentHash || null);
      } else if (outcome.status === STATUS.NOT_CONFIGURED) {
        counters.notConfigured += 1;
        await updateSource(source.id, STATUS.NOT_CONFIGURED, outcome.error || 'Integration not configured', null);
      } else if (outcome.status === STATUS.SKIPPED) {
        counters.skipped += 1;
        await updateSource(source.id, STATUS.SKIPPED, outcome.note || null, null);
      } else {
        counters.failed += 1;
        errors.push(`${competitor.name} / ${source.label}: ${outcome.error || outcome.status}`);
        await updateSource(source.id, outcome.status, outcome.error || outcome.status, null, true);
      }
      entry.durationMs = Date.now() - t0;
      perSource.push(entry);
    }
  }

  const competitorIds = competitors.map((c) => c.id);
  let analysisResult = { created: [], merged: [], escalations: [] };
  if (competitorIds.length) {
    analysisResult = await analysis.analysePendingItems({ competitorIds, scanRunId: runId });
  }

  for (const signalId of analysisResult.escalations) {
    try {
      await digest.sendInstantAlert(signalId);
    } catch (err) {
      errors.push(`Instant alert for signal #${signalId}: ${err.message}`);
    }
  }

  const status = counters.failed > 0 ? (counters.ok > 0 ? 'partial' : 'failed') : 'completed';
  const durationMs = Date.now() - started;

  await db.exec(
    `UPDATE scan_runs SET
        status = ?, finished_at = NOW(), duration_ms = ?,
        competitors_scanned = ?, sources_total = ?, sources_ok = ?, sources_failed = ?,
        sources_not_configured = ?, sources_skipped = ?, items_collected = ?,
        signals_created = ?, signals_merged = ?, error_summary = ?, results_json = ?
      WHERE id = ?`,
    [
      status, durationMs, competitors.length, counters.total, counters.ok, counters.failed,
      counters.notConfigured, counters.skipped, counters.items,
      analysisResult.created.length, analysisResult.merged.length,
      errors.length ? errors.join('\n').slice(0, 4000) : null,
      JSON.stringify(perSource).slice(0, 4000000),
      runId
    ]
  );

  return {
    runId,
    status,
    durationMs,
    counters,
    signalsCreated: analysisResult.created.length,
    signalsMerged: analysisResult.merged.length,
    alerts: analysisResult.escalations.length
  };
}

async function persistItems({ competitor, source, runId, items, connectorKey }) {
  let inserted = 0;
  for (const item of items) {
    try {
      const result = await db.exec(
        `INSERT INTO collected_items
          (competitor_id, source_id, scan_run_id, connector_key, source_type, title, url, author,
           excerpt, raw_content, content_hash, change_type, diff_summary, credibility,
           published_at, captured_at, processing_status, signal_type_guess, is_mock)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),'pending',?,?)
         ON DUPLICATE KEY UPDATE
           scan_run_id = VALUES(scan_run_id),
           change_type = 'unchanged',
           captured_at = NOW()`,
        [
          competitor.id, source.id, runId, connectorKey, source.watch_target,
          String(item.title).slice(0, 400), item.url ? String(item.url).slice(0, 600) : null,
          item.author ? String(item.author).slice(0, 190) : null,
          item.excerpt ? String(item.excerpt).slice(0, 4000) : null,
          item.rawContent ? String(item.rawContent).slice(0, 60000) : null,
          item.contentHash, item.changeType, item.diffSummary, item.credibility,
          item.publishedAt, item.typeGuess, item.isMock ? 1 : 0
        ]
      );
      if (result.affectedRows === 1 && result.insertId) inserted += 1;
    } catch (err) {
      console.error('[scan] failed to persist item', err.message);
    }
  }
  return inserted;
}

async function updateSource(sourceId, status, error, contentHash, isFailure = false) {
  const sets = ['last_checked_at = NOW()', 'last_status = ?', 'last_error = ?'];
  const params = [status, error ? String(error).slice(0, 500) : null];
  if (contentHash) { sets.push('last_content_hash = ?'); params.push(contentHash); }
  sets.push(isFailure ? 'consecutive_failures = consecutive_failures + 1' : 'consecutive_failures = 0');
  params.push(sourceId);
  await db.exec(`UPDATE competitor_sources SET ${sets.join(', ')} WHERE id = ?`, params);
}

// ── Read helpers for the Run History screen / API ──────────────────────────
const SORTS = {
  started_at: 'sr.started_at',
  status: 'sr.status',
  items: 'sr.items_collected',
  signals: 'sr.signals_created',
  duration: 'sr.duration_ms'
};

async function listRuns(query = {}) {
  const { page, perPage, offset } = parsePaging(query, 25);
  const where = [];
  const params = [];
  if (query.status) { where.push('sr.status = ?'); params.push(query.status); }
  if (query.runType) { where.push('sr.run_type = ?'); params.push(query.runType); }
  if (query.competitorId) { where.push('sr.competitor_id = ?'); params.push(query.competitorId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortKey = SORTS[query.sort] ? query.sort : 'started_at';

  const rows = await db.query(
    `SELECT sr.*, c.name AS competitor_name, u.full_name AS triggered_by_name
       FROM scan_runs sr
       LEFT JOIN competitors c ON c.id = sr.competitor_id
       LEFT JOIN users u ON u.id = sr.triggered_by
       ${whereSql}
      ORDER BY ${SORTS[sortKey]} ${dir}, sr.id DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  const totalRow = await db.one(`SELECT COUNT(*) AS n FROM scan_runs sr ${whereSql}`, params);
  return { rows, pager: buildPager(Number(totalRow.n), page, perPage), sort: sortKey, dir: dir.toLowerCase() };
}

async function getRun(id) {
  const run = await db.one(
    `SELECT sr.*, c.name AS competitor_name, u.full_name AS triggered_by_name
       FROM scan_runs sr
       LEFT JOIN competitors c ON c.id = sr.competitor_id
       LEFT JOIN users u ON u.id = sr.triggered_by
      WHERE sr.id = ?`,
    [id]
  );
  if (!run) return null;
  let results = [];
  try { results = run.results_json ? JSON.parse(run.results_json) : []; } catch (_) { results = []; }
  const items = await db.query(
    `SELECT ci.*, c.name AS competitor_name FROM collected_items ci
       JOIN competitors c ON c.id = ci.competitor_id
      WHERE ci.scan_run_id = ? ORDER BY ci.captured_at DESC LIMIT 100`,
    [id]
  );
  const signals = await db.query(
    `SELECT s.*, c.name AS competitor_name FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
      WHERE s.scan_run_id = ? ORDER BY s.confidence DESC LIMIT 50`,
    [id]
  );
  return { run, results, items, signals };
}

function isRunning() {
  return Boolean(runningPromise);
}

module.exports = { runScan, listRuns, getRun, isRunning };
