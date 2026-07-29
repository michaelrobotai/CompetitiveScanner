'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'social',
  name: 'Social Chatter (X / Reddit)',
  category: 'Social / professional',
  authType: 'api_key',
  envKey: 'SOCIAL_API_KEY',
  credibility: 45,
  rateLimitPerHour: 60,
  description: 'Measures mention volume and sentiment spikes on X and Reddit. Low credibility on its own; valuable as corroboration.',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('social', competitor, source).map((m) => makeItem({ ...m, credibility: 45 }));
        return { status: STATUS.OK, items, note: 'SOCIAL_API_KEY not configured — demo mode produced simulated chatter analytics.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'SOCIAL_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No chatter spike since last check.' };
  }
});
