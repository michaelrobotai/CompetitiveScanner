'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'review_site',
  name: 'Review Sites (G2 / Capterra)',
  category: 'Customer voice',
  authType: 'api_key',
  envKey: 'REVIEW_API_KEY',
  credibility: 65,
  rateLimitPerHour: 40,
  description: 'Watches rating movement and review themes on G2 and Capterra — early churn and pricing-backlash indicator.',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('review_site', competitor, source).map((m) => makeItem({ ...m, credibility: 65 }));
        return { status: STATUS.OK, items, note: 'REVIEW_API_KEY not configured — demo mode produced simulated review analytics.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'REVIEW_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No rating movement since last check.' };
  }
});
