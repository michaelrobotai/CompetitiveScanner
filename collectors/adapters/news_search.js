'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'news_search',
  name: 'News & Tech Press Mentions',
  category: 'Third-party media',
  authType: 'api_key',
  envKey: 'NEWS_API_KEY',
  credibility: 82,
  rateLimitPerHour: 100,
  description: 'Searches general and tech press for competitor mentions (deal rumours, funding, launches, layoffs).',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('news_search', competitor, source).map((m) => makeItem({ ...m, credibility: 82 }));
        return { status: STATUS.OK, items, note: 'NEWS_API_KEY not configured — demo mode produced simulated press coverage.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'NEWS_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No new press mentions since last check.' };
  }
});
