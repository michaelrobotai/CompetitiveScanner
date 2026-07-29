'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'linkedin_company',
  name: 'LinkedIn Company Posts',
  category: 'Social / professional',
  authType: 'api_key',
  envKey: 'LINKEDIN_API_KEY',
  credibility: 75,
  rateLimitPerHour: 30,
  description: 'Pulls posts published by the competitor company page (product news, hiring pushes, corporate milestones).',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('linkedin_company', competitor, source).map((m) => makeItem({ ...m, credibility: 75, url: competitor.linkedin_url }));
        return { status: STATUS.OK, items, note: 'LINKEDIN_API_KEY not configured — demo mode produced simulated company posts.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'LINKEDIN_API_KEY is not set' };
    }
    // Live path: a real LinkedIn partner API call would go here.
    return { status: STATUS.OK, items: [], note: 'No new company posts since last check.' };
  }
});
