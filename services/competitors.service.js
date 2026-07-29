
'use strict';
const db = require('../config/db');
const { parsePaging, buildPager } = require('../utils/pagination');
const audit = require('./audit.service');

const SORTS = {
  name: 'c.name',
  priority: "FIELD(c.priority,'high','medium','low')",
  status: 'c.tracking_status',
  signals: 'signal_count',
  last_signal: 'last_signal_at',
  created_at: 'c.created_at'
};

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || 'competitor';
}

async function uniqueSlug(name, excludeId = null) {
  const base = slugify(name);
  let slug = base;
  let n = 1;
  /* eslint-disable no-await-in-loop */
  while (true) {
    const row = await db.one(
      excludeId
        ? 'SELECT id FROM competitors WHERE slug = ? AND id <> ? LIMIT 1'
        : 'SELECT id FROM competitors WHERE slug = ? LIMIT 1',
      excludeId ? [slug, excludeId] : [slug]
    );
    if (!row) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function list(query = {}) {
  const { page, perPage, offset } = parsePaging(query, 25);
  const where = [];
  const params = [];
  if (query.q) { where.push('(c.name LIKE ? OR c.industry LIKE ? OR c.tags LIKE ?)'); params.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
  if (query.status) { where.push('c.tracking_status = ?'); params.push(query.status); }
  if (query.priority) { where.push('c.priority = ?'); params.push(query.priority); }
  if (query.industry) { where.push('c.industry = ?'); params.push(query.industry); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortKey = SORTS[query.sort] ? query.sort : 'priority';
  const effectiveDir = query.sort ? dir : 'ASC';

  const rows = await db.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM competitor_sources cs WHERE cs.competitor_id = c.id) AS source_count,
       (SELECT COUNT(*) FROM signals s WHERE s.competitor_id = c.id AND s.status <> 'merged') AS signal_count,
       (SELECT COUNT(*) FROM signals s WHERE s.competitor_id = c.id AND s.status = 'new') AS new_signal_count,
       (SELECT MAX(s.detected_at) FROM signals s WHERE s.competitor_id = c.id) AS last_signal_at,
       (SELECT MAX(cs.last_checked_at) FROM competitor_sources cs WHERE cs.competitor_id = c.id) AS last_checked_at,
       (SELECT MAX(s.confidence) FROM signals s WHERE s.competitor_id = c.id AND s.status <> 'dismissed') AS top_confidence
     FROM competitors c
     ${whereSql}
     ORDER BY ${SORTS[sortKey]} ${effectiveDir}, c.name ASC
     LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  const totalRow = await db.one(`SELECT COUNT(*) AS n FROM competitors c ${whereSql}`, params);
  const industries = await db.query("SELECT DISTINCT industry FROM competitors WHERE industry IS NOT NULL AND industry <> '' ORDER BY industry");
  return {
    rows,
    pager: buildPager(Number(totalRow.n), page, perPage),
    industries: industries.map((r) => r.industry),
    sort: sortKey,
    dir: effectiveDir.toLowerCase()
  };
}

async function all() {
  return db.query("SELECT id, name, tracking_status, priority FROM competitors WHERE tracking_status <> 'archived' ORDER BY name");
}

async function get(id) {
  return db.one('SELECT * FROM competitors WHERE id = ?', [id]);
}

async function detail(id) {
  const competitor = await get(id);
  if (!competitor) return null;
  const [sources, signals, items, profile, notes, runs, stats] = await Promise.all([
    db.query('SELECT * FROM competitor_sources WHERE competitor_id = ? ORDER BY connector_key, label', [id]),
    db.query(
      `SELECT * FROM signals WHERE competitor_id = ? AND status <> 'merged'
        ORDER BY detected_at DESC, confidence DESC LIMIT 40`,
      [id]
    ),
    db.query('SELECT * FROM collected_items WHERE competitor_id = ? ORDER BY captured_at DESC LIMIT 30', [id]),
    db.one('SELECT * FROM strategy_profiles WHERE competitor_id = ?', [id]),
    db.query(
      `SELECT n.*, u.full_name AS author_name FROM notes n
         LEFT JOIN users u ON u.id = n.author_id
        WHERE n.competitor_id = ? ORDER BY n.created_at DESC LIMIT 25`,
      [id]
    ),
    db.query(
      `SELECT sr.* FROM scan_runs sr
        WHERE sr.competitor_id = ? OR sr.id IN (SELECT DISTINCT scan_run_id FROM collected_items WHERE competitor_id = ? AND scan_run_id IS NOT NULL)
        ORDER BY sr.started_at DESC LIMIT 10`,
      [id, id]
    ),
    db.one(
      `SELECT
         (SELECT COUNT(*) FROM signals WHERE competitor_id = ? AND status <> 'merged') AS signals_total,
         (SELECT COUNT(*) FROM signals WHERE competitor_id = ? AND status = 'new') AS signals_new,
         (SELECT COUNT(*) FROM signals WHERE competitor_id = ? AND severity IN ('critical','high') AND status <> 'dismissed') AS signals_high,
         (SELECT COUNT(*) FROM collected_items WHERE competitor_id = ?) AS items_total,
         (SELECT MAX(detected_at) FROM signals WHERE competitor_id = ?) AS last_signal_at`,
      [id, id, id, id, id]
    )
  ]);
  const byCategory = await db.query(
    `SELECT signal_type, COUNT(*) AS n, MAX(confidence) AS top_confidence
       FROM signals WHERE competitor_id = ? AND status <> 'merged'
      GROUP BY signal_type ORDER BY n DESC`,
    [id]
  );
  return { competitor, sources, signals, items, profile, notes, runs, stats, byCategory };
}

function normalize(body) {
  return {
    name: String(body.name || '').trim(),
    website: body.website ? String(body.website).trim() : null,
    linkedin_url: body.linkedin_url ? String(body.linkedin_url).trim() : null,
    ticker: body.ticker ? String(body.ticker).trim().toUpperCase() : null,
    industry: body.industry ? String(body.industry).trim() : null,
    hq_country: body.hq_country ? String(body.hq_country).trim() : null,
    size_band: ['1-50', '51-200', '201-1000', '1001-5000', '5000+', 'unknown'].includes(body.size_band) ? body.size_band : 'unknown',
    priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
    tracking_status: ['active', 'paused', 'archived'].includes(body.tracking_status) ? body.tracking_status : 'active',
    description: body.description ? String(body.description).trim() : null,
    tags: body.tags ? String(body.tags).trim() : null
  };
}

async function create(body, actor, ip) {
  const data = normalize(body);
  if (!data.name) {
    const err = new Error('Competitor name is required'); err.status = 400; err.expose = true; throw err;
  }
  const slug = await uniqueSlug(data.name);
  const result = await db.exec(
    `INSERT INTO competitors (name, slug, website, linkedin_url, ticker, industry, hq_country,
       size_band, priority, tracking_status, description, tags, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.name, slug, data.website, data.linkedin_url, data.ticker, data.industry, data.hq_country,
      data.size_band, data.priority, data.tracking_status, data.description, data.tags, actor ? actor.id : null]
  );
  const id = result.insertId;

  if (body.autoSources !== 'off') {
    await createDefaultSources(id, data);
  }
  await audit.log({ actor, action: 'create', entityType: 'competitor', entityId: id, entityLabel: data.name, details: data, ip });
  return id;
}

async function createDefaultSources(competitorId, data) {
  const base = data.website ? data.website.replace(/\/+$/, '') : null;
  const defaults = [];
  if (base) {
    defaults.push({ connector: 'website_page', label: 'Pricing page', url: `${base}/pricing`, target: 'pricing' });
    defaults.push({ connector: 'website_page', label: 'Product page', url: `${base}/product`, target: 'product' });
    defaults.push({ connector: 'website_page', label: 'Careers page', url: `${base}/careers`, target: 'careers' });
    defaults.push({ connector: 'blog_rss', label: 'Blog / newsroom feed', url: `${base}/blog/rss.xml`, target: 'blog' });
  }
  if (data.linkedin_url) {
    defaults.push({ connector: 'linkedin_company', label: 'LinkedIn company posts', url: data.linkedin_url, target: 'company' });
    defaults.push({ connector: 'linkedin_executive', label: 'LinkedIn executive posts', url: data.linkedin_url, target: 'executives' });
  }
  defaults.push({ connector: 'news_search', label: 'News & tech press mentions', url: null, target: 'news' });
  defaults.push({ connector: 'job_board', label: 'Job postings', url: null, target: 'jobs' });
  defaults.push({ connector: 'funding_db', label: 'Funding / M&A records', url: null, target: 'funding' });
  if (data.ticker) defaults.push({ connector: 'sec_filing', label: 'SEC filings', url: null, target: 'filings' });
  defaults.push({ connector: 'review_site', label: 'G2 / Capterra reviews', url: null, target: 'reviews' });
  defaults.push({ connector: 'social', label: 'X / Reddit chatter', url: null, target: 'social' });

  for (const d of defaults) {
    await db.exec(
      `INSERT INTO competitor_sources (competitor_id, connector_key, label, url, watch_target, enabled, check_frequency)
       VALUES (?,?,?,?,?,1,'daily')`,
      [competitorId, d.connector, d.label, d.url, d.target]
    );
  }
}

async function update(id, body, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('Competitor not found'); err.status = 404; err.expose = true; throw err; }
  const data = normalize(body);
  if (!data.name) { const err = new Error('Competitor name is required'); err.status = 400; err.expose = true; throw err; }
  const slug = data.name !== existing.name ? await uniqueSlug(data.name, id) : existing.slug;
  await db.exec(
    `UPDATE competitors SET name=?, slug=?, website=?, linkedin_url=?, ticker=?, industry=?, hq_country=?,
       size_band=?, priority=?, tracking_status=?, description=?, tags=? WHERE id=?`,
    [data.name, slug, data.website, data.linkedin_url, data.ticker, data.industry, data.hq_country,
      data.size_band, data.priority, data.tracking_status, data.description, data.tags, id]
  );
  const changed = {};
  Object.keys(data).forEach((k) => {
    if (String(existing[k] == null ? '' : existing[k]) !== String(data[k] == null ? '' : data[k])) {
      changed[k] = { from: existing[k], to: data[k] };
    }
  });
  await audit.log({ actor, action: 'update', entityType: 'competitor', entityId: id, entityLabel: data.name, details: changed, ip });
  return id;
}

async function setStatus(id, status, actor, ip) {
  if (!['active', 'paused', 'archived'].includes(status)) {
    const err = new Error('Invalid tracking status'); err.status = 400; err.expose = true; throw err;
  }
  const existing = await get(id);
  if (!existing) { const err = new Error('Competitor not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec('UPDATE competitors SET tracking_status = ? WHERE id = ?', [status, id]);
  await audit.log({
    actor, action: 'update_status', entityType: 'competitor', entityId: id,
    entityLabel: existing.name, details: { from: existing.tracking_status, to: status }, ip
  });
}

async function remove(id, actor, ip) {
  const existing = await get(id);
  if (!existing) { const err = new Error('Competitor not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec('DELETE FROM competitors WHERE id = ?', [id]);
  await audit.log({ actor, action: 'delete', entityType: 'competitor', entityId: id, entityLabel: existing.name, details: { name: existing.name }, ip });
}

async function saveProfile(competitorId, body, actor, ip) {
  const existing = await db.one('SELECT id FROM strategy_profiles WHERE competitor_id = ?', [competitorId]);
  const fields = {
    positioning: body.positioning || null,
    target_segments: body.target_segments || null,
    pricing_model: body.pricing_model || null,
    key_products: body.key_products || null,
    strengths: body.strengths || null,
    weaknesses: body.weaknesses || null,
    recent_moves: body.recent_moves || null,
    threat_level: ['critical', 'high', 'medium', 'low'].includes(body.threat_level) ? body.threat_level : 'medium'
  };
  if (existing) {
    await db.exec(
      `UPDATE strategy_profiles SET positioning=?, target_segments=?, pricing_model=?, key_products=?,
        strengths=?, weaknesses=?, recent_moves=?, threat_level=?, updated_by=? WHERE competitor_id=?`,
      [fields.positioning, fields.target_segments, fields.pricing_model, fields.key_products,
        fields.strengths, fields.weaknesses, fields.recent_moves, fields.threat_level,
        actor ? actor.id : null, competitorId]
    );
  } else {
    await db.exec(
      `INSERT INTO strategy_profiles (competitor_id, positioning, target_segments, pricing_model, key_products,
         strengths, weaknesses, recent_moves, threat_level, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [competitorId, fields.positioning, fields.target_segments, fields.pricing_model, fields.key_products,
        fields.strengths, fields.weaknesses, fields.recent_moves, fields.threat_level, actor ? actor.id : null]
    );
  }
  await audit.log({ actor, action: 'update', entityType: 'strategy_profile', entityId: competitorId, entityLabel: `Profile for competitor #${competitorId}`, details: fields, ip });
}

async function addNote({ competitorId = null, signalId = null, body, actor }) {
  const text = String(body || '').trim();
  if (!text) { const err = new Error('Note cannot be empty'); err.status = 400; err.expose = true; throw err; }
  const result = await db.exec(
    'INSERT INTO notes (competitor_id, signal_id, author_id, body) VALUES (?,?,?,?)',
    [competitorId, signalId, actor ? actor.id : null, text]
  );
  return result.insertId;
}

module.exports = {
  list, all, get, detail, create, update, remove, setStatus,
  saveProfile, addNote, createDefaultSources, slugify
};
