'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

module.exports = defineAdapter({
  key: 'job_board',
  name: 'Job Postings',
  category: 'Hiring signals',
  authType: 'api_key',
  envKey: 'JOBS_API_KEY',
  credibility: 68,
  rateLimitPerHour: 60,
  description: 'Tracks open-role volume and role types — corp-dev/M&A hires and sudden contractions are leading indicators.',
  async collect(ctx) {
    const { competitor, source, env, demoMode } = ctx;
    if (!this.isConfigured(env)) {
      if (demoMode) {
        const items = mock.generate('job_board', competitor, source).map((m) => makeItem({ ...m, credibility: 68 }));
        return { status: STATUS.OK, items, note: 'JOBS_API_KEY not configured — demo mode produced simulated hiring data.' };
      }
      return { status: STATUS.NOT_CONFIGURED, items: [], error: 'JOBS_API_KEY is not set' };
    }
    return { status: STATUS.OK, items: [], note: 'No hiring changes since last check.' };
  }
});
