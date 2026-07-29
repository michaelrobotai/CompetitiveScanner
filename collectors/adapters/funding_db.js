'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'funding_db',
  name: 'Funding / M&A Database',
  category: 'Deal intelligence',
  authType: 'api_key',
  envKey: 'FUNDING_API_KEY',
  credibility: 90,
  rateLimitPerHour: 40,
  description: 'Looks up rounds, valuations, acquirers and acquisition targets in a funding/M&A database.',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('funding_db', competitor, source).map((m) => makeItem({ ...m, credibility: 90 }));
        return { status: STATUS.OK, items, note: 'FUNDING_API_KEY not configured — demo mode produced simulated deal records.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'FUNDING_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No new deal records since last check.' };
  }
});
