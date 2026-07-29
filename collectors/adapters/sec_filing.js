'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

// SEC EDGAR is a public API and needs no key, but it does require a descriptive
// User-Agent. For private competitors (no ticker) the source is skipped.
module.exports = defineAdapter({
  key: 'sec_filing',
  name: 'SEC / Public Filings',
  category: 'Regulatory',
  authType: 'none',
  envKey: null,
  credibility: 98,
  rateLimitPerHour: 100,
  description: 'Reads 8-K / 10-Q / 10-K filings from EDGAR — the highest-credibility source for mergers and revenue swings.',
  isConfigured: () => true,
  async collect(ctx) {
    const { competitor, source, fetchPage, demoMode } = ctx;
    if (!competitor.ticker) {
      return { status: STATUS.SKIPPED, items: [], note: 'Competitor is private (no ticker) — filings source skipped.' };
    }

    const url = source.url || `https://data.sec.gov/api/xbrl/companyconcept/CIK0000000000/us-gaap/Revenues.json`;
    const result = await fetchPage(url, { raw: true });
    if (result.rateLimited) return { status: STATUS.RATE_LIMITED, items: [], error: `EDGAR rate limit (HTTP ${result.statusCode})` };

    if (!result.ok) {
      if (demoMode) {
        const items = mock.generate('sec_filing', competitor, source).map((m) => makeItem({ ...m, credibility: 98, url }));
        return { status: STATUS.OK, items, note: `EDGAR unreachable (${result.error || 'network error'}); demo mode produced simulated filings.` };
      }
      return { status: STATUS.ERROR, items: [], error: result.error || `HTTP ${result.statusCode}` };
    }

    if (demoMode) {
      const items = mock.generate('sec_filing', competitor, source).map((m) => makeItem({ ...m, credibility: 98, url }));
      return { status: STATUS.OK, items, note: 'Demo mode: filings summarised from simulated EDGAR extracts.' };
    }
    return { status: STATUS.OK, items: [], note: 'No new filings since last check.' };
  }
});
