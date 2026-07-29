'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const { sha256 } = require('../../utils/hash');
const mock = require('../mockData');

// Competitor website page monitor (pricing / product / careers / any URL).
// Real collection: fetch the page, strip markup, hash the text, compare with the
// previously stored hash on competitor_sources.last_content_hash -> diff summary.
module.exports = defineAdapter({
  key: 'website_page',
  name: 'Competitor Website Pages',
  category: 'Web monitoring',
  authType: 'scrape',
  envKey: null,
  credibility: 85,
  respectsRobots: true,
  rateLimitPerHour: 120,
  description: 'Fetches pricing, product and careers pages and detects content changes via SHA-256 text hashing and line diffing.',
  isConfigured: () => true,
  async collect(ctx) {
    const { competitor, source, fetchPage, demoMode } = ctx;
    if (!source.url) {
      return { status: STATUS.ERROR, items: [], error: 'No URL configured for this page watcher' };
    }

    const result = await fetchPage(source.url);
    if (result.robotsBlocked) {
      return { status: STATUS.ROBOTS_BLOCKED, items: [], error: `robots.txt disallows ${source.url}` };
    }
    if (result.rateLimited) {
      return { status: STATUS.RATE_LIMITED, items: [], error: `Rate limited (HTTP ${result.statusCode}) for ${source.url}` };
    }
    if (!result.ok) {
      if (demoMode) {
        const items = mock.generate('website_page', competitor, source).map((m) => makeItem({ ...m, credibility: 85 }));
        return {
          status: STATUS.OK,
          items,
          note: `Live fetch unavailable (${result.error || 'network error'}); demo mode produced a simulated page-change item.`
        };
      }
      return { status: STATUS.ERROR, items: [], error: result.error || `HTTP ${result.statusCode}` };
    }

    const text = result.text;
    const hash = sha256(text);
    if (source.last_content_hash && source.last_content_hash === hash) {
      return { status: STATUS.OK, items: [], note: 'No change since last check (identical content hash)' };
    }

    const diffSummary = buildDiff(result.previousText, text);
    const item = makeItem({
      title: `${competitor.name} — ${source.label} changed`,
      url: source.url,
      excerpt: text.slice(0, 400),
      rawContent: text.slice(0, 20000),
      contentHash: hash,
      changeType: source.last_content_hash ? 'changed' : 'new',
      diffSummary,
      credibility: 85,
      typeGuess: guessFromWatchTarget(source.watch_target, text),
      publishedAt: new Date()
    });

    return { status: STATUS.OK, items: [item], newContentHash: hash };
  }
});

function buildDiff(previous, current) {
  if (!previous) return 'First capture of this page — baseline snapshot stored.';
  const prevLines = new Set(String(previous).split('\n').map((l) => l.trim()).filter(Boolean));
  const currLines = String(current).split('\n').map((l) => l.trim()).filter(Boolean);
  const added = currLines.filter((l) => !prevLines.has(l)).slice(0, 12);
  return added.length ? added.map((l) => `+ ${l}`).join('\n') : 'Content hash changed (whitespace or markup level differences).';
}

function guessFromWatchTarget(target, text) {
  const lower = String(text || '').toLowerCase();
  if (target === 'careers' && /corporate development|m&a|integration/.test(lower)) return 'acquiring_company';
  if (target === 'pricing' && /price increase|new tier|enterprise/.test(lower)) return 'other_strategic_move';
  if (target === 'product' && /introducing|now available|general availability/.test(lower)) return 'major_product_release';
  return 'other_strategic_move';
}
