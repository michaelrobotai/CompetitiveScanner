'use strict';
const db = require('../config/db');
const env = require('../config/env');
const { SIGNAL_TYPES } = require('../utils/format');

// ── Classification rules ───────────────────────────────────────────────────
// Each rule contributes a weighted score; the highest scoring type wins.
const RULES = [
  {
    type: 'merger',
    weight: 1.15,
    patterns: [
      /\bmerger\b/i, /agreement and plan of merger/i, /\bmerge(s|d)? with\b/i,
      /definitive agreement/i, /join forces/i, /combination with/i
    ]
  },
  {
    type: 'acquisition_target',
    weight: 1.1,
    patterns: [
      /(to be|being) acquired/i, /acquisition target/i, /strategic alternatives/i,
      /exploring a sale/i, /retained (bankers|advisors)/i, /takeover (talks|bid|interest)/i,
      /in (advanced |late-stage )?talks to be (acquired|bought)/i, /getting bought/i
    ]
  },
  {
    type: 'acquiring_company',
    weight: 1.05,
    patterns: [
      /\bacquires?\b/i, /\bacquired\b(?!\s+by)/i, /acquisition of/i,
      /vp corporate development/i, /m&a integration/i, /tuck-?in acquisition/i
    ]
  },
  {
    type: 'major_product_release',
    weight: 1.0,
    patterns: [
      /introducing\s+\w+/i, /general availability/i, /\bnow available\b/i,
      /biggest (product )?(release|launch)/i, /\blaunche[sd]\b/i, /new platform/i,
      /major (release|update|version)/i
    ]
  },
  {
    type: 'unusual_revenue_gain',
    weight: 1.0,
    patterns: [
      /record (quarter|revenue|arr)/i, /revenue (grew|up|increase[d]?)\s*\d+/i,
      /net revenue retention/i, /\d+%\s*of plan/i, /pipeline up \d+x/i,
      /raises? \$\d+/i, /series [a-e] /i, /post-money valuation/i
    ]
  },
  {
    type: 'unusual_revenue_loss',
    weight: 1.05,
    patterns: [
      /revenue (down|declin\w*|decrease[d]?)\s*\d*/i, /goodwill impairment/i,
      /layoff|laid off|reduction in force/i, /postings? (dropped|fell)/i,
      /rating (slipped|declined|dropped)/i, /churn/i, /missed (guidance|plan)/i
    ]
  }
];

const CATEGORY_TITLES = {
  merger: (c) => `${c.name}: merger agreement signals detected`,
  acquisition_target: (c) => `${c.name} shows acquisition-target behaviour`,
  acquiring_company: (c) => `${c.name} appears to be acquiring a company`,
  major_product_release: (c) => `${c.name} shipped a major product release`,
  unusual_revenue_gain: (c) => `${c.name}: unusual revenue / funding gain`,
  unusual_revenue_loss: (c) => `${c.name}: unusual revenue deterioration`,
  other_strategic_move: (c) => `${c.name}: notable strategic move`
};

function classify(item) {
  const haystack = `${item.title || ''}\n${item.excerpt || ''}\n${(item.raw_content || item.rawContent || '')}`.slice(0, 6000);
  let best = { type: 'other_strategic_move', score: 0.35, hits: [] };
  for (const rule of RULES) {
    const hits = rule.patterns.filter((re) => re.test(haystack)).map((re) => String(re));
    if (!hits.length) continue;
    const score = Math.min(1, 0.45 + 0.18 * hits.length) * rule.weight;
    if (score > best.score) best = { type: rule.type, score, hits };
  }
  // The adapter's own guess acts as a tiebreaker when text matching is weak.
  const guess = item.signal_type_guess || item.typeGuess;
  if (best.score < 0.55 && guess && SIGNAL_TYPES[guess]) {
    best = { type: guess, score: 0.55, hits: ['adapter type hint'] };
  }
  return best;
}

// Confidence = 40% source credibility + 40% corroboration + 20% recency
function computeConfidence({ credibilityAvg, sourceCount, newestAt }) {
  const credibilityPart = (Math.max(0, Math.min(100, credibilityAvg)) / 100) * 40;
  const corroborationPart = Math.min(1, (sourceCount - 1) / 2) * 40 + (sourceCount >= 1 ? 8 : 0);
  const ageHours = newestAt ? Math.max(0, (Date.now() - new Date(newestAt).getTime()) / 3600000) : 999;
  const recencyPart = ageHours <= 24 ? 20 : ageHours <= 72 ? 14 : ageHours <= 168 ? 8 : 3;
  return Math.max(1, Math.min(100, Math.round(credibilityPart + Math.min(40, corroborationPart) + recencyPart)));
}

function computeImpact(type, competitor, confidence) {
  const base = (SIGNAL_TYPES[type] && SIGNAL_TYPES[type].baseImpact) || 50;
  const priorityBump = competitor.priority === 'high' ? 10 : competitor.priority === 'low' ? -8 : 0;
  const confBump = Math.round((confidence - 50) / 10);
  return Math.max(1, Math.min(100, base + priorityBump + confBump));
}

function severityFor(impact, confidence) {
  const blended = impact * 0.6 + confidence * 0.4;
  if (blended >= 82) return 'critical';
  if (blended >= 65) return 'high';
  if (blended >= 45) return 'medium';
  return 'low';
}

function dedupeKeyFor(type, competitor) {
  return `${competitor.id}:${type}`;
}

function buildRationale({ type, items, confidence, impact, hits }) {
  const sources = [...new Set(items.map((i) => i.connector_key))];
  const lines = [
    `Classified as "${SIGNAL_TYPES[type].label}" from ${items.length} collected item(s) across ${sources.length} source type(s): ${sources.join(', ')}.`,
    hits && hits.length ? `Trigger phrases matched: ${hits.slice(0, 4).map((h) => h.replace(/^\/|\/[a-z]*$/g, '')).join('; ')}.` : null,
    `Confidence ${confidence}/100 = 40% weighted source credibility (avg ${Math.round(items.reduce((s, i) => s + Number(i.credibility || 60), 0) / items.length)}) + 40% cross-source corroboration (${sources.length} distinct source type(s)) + 20% recency.`,
    `Impact ${impact}/100 derived from category base impact and competitor priority.`,
    items.some((i) => Number(i.is_mock) === 1) ? 'Note: one or more evidence items were produced in demo mode because the corresponding integration has no credentials configured.' : null
  ].filter(Boolean);
  return lines.join('\n');
}

function buildSummary({ type, competitor, items }) {
  const lead = items[0];
  const extra = items.length > 1 ? ` Corroborated by ${items.length - 1} additional item(s).` : '';
  return `${SIGNAL_TYPES[type].label} detected for ${competitor.name}. Lead evidence: "${lead.title}". ${(lead.excerpt || '').slice(0, 260)}${extra}`.trim();
}

// ── Main entry: analyse pending items for a set of competitors ──────────────
async function analysePendingItems({ competitorIds = null, scanRunId = null } = {}) {
  const params = [];
  let where = "ci.processing_status = 'pending'";
  if (competitorIds && competitorIds.length) {
    where += ` AND ci.competitor_id IN (${competitorIds.map(() => '?').join(',')})`;
    params.push(...competitorIds);
  }
  const items = await db.query(
    `SELECT ci.*, c.name, c.priority, c.id AS comp_id
     FROM collected_items ci
     JOIN competitors c ON c.id = ci.competitor_id
     WHERE ${where}
     ORDER BY ci.competitor_id, ci.captured_at DESC
     LIMIT 500`,
    params
  );

  const created = [];
  const merged = [];
  const escalations = [];

  // Group: competitor + classified type
  const groups = new Map();
  for (const item of items) {
    const cls = classify(item);
    const key = `${item.competitor_id}:${cls.type}`;
    if (!groups.has(key)) {
      groups.set(key, {
        competitor: { id: item.competitor_id, name: item.name, priority: item.priority },
        type: cls.type,
        hits: cls.hits,
        items: []
      });
    }
    const g = groups.get(key);
    g.items.push(item);
    if (cls.hits.length > g.hits.length) g.hits = cls.hits;
  }

  for (const group of groups.values()) {
    const { competitor, type, items: groupItems, hits } = group;
    const distinctSources = [...new Set(groupItems.map((i) => i.connector_key))];
    const credibilityAvg = groupItems.reduce((s, i) => s + Number(i.credibility || 60), 0) / groupItems.length;
    const newestAt = groupItems.reduce((max, i) => {
      const t = new Date(i.published_at || i.captured_at).getTime();
      return t > max ? t : max;
    }, 0);

    const confidence = computeConfidence({
      credibilityAvg,
      sourceCount: distinctSources.length,
      newestAt: new Date(newestAt)
    });

    const itemIds = groupItems.map((i) => i.id);

    // Below-threshold groups: keep the raw items, don't manufacture a signal.
    if (confidence < env.signals.minConfidence) {
      await markItems(itemIds, 'ignored');
      continue;
    }

    const impact = computeImpact(type, competitor, confidence);
    const severity = severityFor(impact, confidence);
    const dedupeKey = dedupeKeyFor(type, competitor);

    // BR: near-duplicate merging inside the dedupe window.
    const existing = await db.one(
      `SELECT * FROM signals
        WHERE competitor_id = ? AND dedupe_key = ? AND status <> 'merged'
          AND detected_at >= (NOW() - INTERVAL ? HOUR)
        ORDER BY detected_at DESC LIMIT 1`,
      [competitor.id, dedupeKey, env.signals.dedupeWindowHours]
    );

    if (existing) {
      const allSources = new Set(distinctSources);
      const prevSources = await db.query(
        `SELECT DISTINCT ci.connector_key FROM signal_evidence se
           JOIN collected_items ci ON ci.id = se.collected_item_id
          WHERE se.signal_id = ?`,
        [existing.id]
      );
      prevSources.forEach((r) => allSources.add(r.connector_key));

      await attachEvidence(existing.id, groupItems);
      const evidenceCount = await countEvidence(existing.id);
      const newConfidence = computeConfidence({
        credibilityAvg,
        sourceCount: allSources.size,
        newestAt: new Date(newestAt)
      });
      const boosted = Math.max(existing.confidence, newConfidence);
      const newImpact = computeImpact(type, competitor, boosted);

      await db.exec(
        `UPDATE signals
            SET confidence = ?, impact = ?, severity = ?, evidence_count = ?,
                corroborating_sources = ?, rationale = ?, detected_at = GREATEST(detected_at, ?),
                scan_run_id = COALESCE(?, scan_run_id)
          WHERE id = ?`,
        [
          boosted, newImpact, severityFor(newImpact, boosted), evidenceCount,
          allSources.size,
          buildRationale({ type, items: groupItems, confidence: boosted, impact: newImpact, hits }),
          new Date(newestAt), scanRunId, existing.id
        ]
      );
      await markItems(itemIds, 'analysed');
      merged.push({ signalId: existing.id, addedItems: itemIds.length });
      if (shouldEscalate({ impact: newImpact, confidence: boosted }) && !existing.alert_sent) {
        escalations.push(existing.id);
      }
      continue;
    }

    const result = await db.exec(
      `INSERT INTO signals
        (competitor_id, scan_run_id, signal_type, title, summary, rationale, confidence, impact,
         severity, status, dedupe_key, evidence_count, corroborating_sources, detected_at)
       VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?,?)`,
      [
        competitor.id, scanRunId, type,
        CATEGORY_TITLES[type](competitor).slice(0, 300),
        buildSummary({ type, competitor, items: groupItems }),
        buildRationale({ type, items: groupItems, confidence, impact, hits }),
        confidence, impact, severity, dedupeKey,
        groupItems.length, distinctSources.length, new Date(newestAt)
      ]
    );
    const signalId = result.insertId;
    await attachEvidence(signalId, groupItems);
    await markItems(itemIds, 'analysed');
    created.push(signalId);
    if (shouldEscalate({ impact, confidence })) escalations.push(signalId);
  }

  return { created, merged, escalations };
}

function shouldEscalate({ impact, confidence }) {
  return impact >= env.signals.alertMinImpact && confidence >= env.signals.alertMinConfidence;
}

async function attachEvidence(signalId, items) {
  for (const item of items) {
    await db.exec(
      `INSERT INTO signal_evidence (signal_id, collected_item_id, relevance, snippet)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE relevance = VALUES(relevance)`,
      [signalId, item.id, Math.min(100, Number(item.credibility || 60) + 10), (item.excerpt || item.title || '').slice(0, 600)]
    );
  }
  const count = await countEvidence(signalId);
  await db.exec('UPDATE signals SET evidence_count = ? WHERE id = ?', [count, signalId]);
}

async function countEvidence(signalId) {
  const row = await db.one('SELECT COUNT(*) AS n FROM signal_evidence WHERE signal_id = ?', [signalId]);
  return row ? Number(row.n) : 0;
}

async function markItems(ids, status) {
  if (!ids.length) return;
  await db.exec(
    `UPDATE collected_items SET processing_status = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [status, ...ids]
  );
}

module.exports = {
  analysePendingItems,
  classify,
  computeConfidence,
  computeImpact,
  severityFor,
  shouldEscalate,
  RULES
};
