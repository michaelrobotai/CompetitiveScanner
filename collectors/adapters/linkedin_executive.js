'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'linkedin_executive',
  name: 'LinkedIn Executive Posts',
  category: 'Social / professional',
  authType: 'api_key',
  envKey: 'LINKEDIN_EXEC_API_KEY',
  credibility: 70,
  rateLimitPerHour: 30,
  description: 'Monitors posts from named executives (CEO, CFO, CRO) — often the earliest tell for strategic moves.',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('linkedin_executive', competitor, source).map((m) => makeItem({ ...m, credibility: 70, url: competitor.linkedin_url }));
        return { status: STATUS.OK, items, note: 'LINKEDIN_EXEC_API_KEY not configured — demo mode produced simulated executive posts.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'LINKEDIN_EXEC_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No new executive posts since last check.' };
  }
});
