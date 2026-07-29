'use strict';
const cron = require('node-cron');
const env = require('../config/env');
const runs = require('../services/runs.service');
const digest = require('../services/digest.service');

const jobs = [];

function start() {
  if (!env.scheduler.enabled) {
    console.log('[scheduler] disabled via SCHEDULER_ENABLED=false');
    return jobs;
  }

  // 1. Daily scheduled scan of all ACTIVE competitors.
  if (cron.validate(env.scheduler.dailyScanCron)) {
    jobs.push(cron.schedule(env.scheduler.dailyScanCron, async () => {
      console.log('[scheduler] daily scan starting');
      try {
        const result = await runs.runScan({ runType: 'scheduled' });
        console.log(`[scheduler] daily scan finished: run #${result.runId} ${result.status}`);
      } catch (err) {
        console.error('[scheduler] daily scan failed:', err.message);
      }
    }));
    console.log(`[scheduler] daily scan registered (${env.scheduler.dailyScanCron})`);
  } else {
    console.warn(`[scheduler] invalid DAILY_SCAN_CRON: ${env.scheduler.dailyScanCron}`);
  }

  // 2. Digest delivery.
  if (cron.validate(env.scheduler.digestCron)) {
    jobs.push(cron.schedule(env.scheduler.digestCron, async () => {
      console.log('[scheduler] digest send starting');
      try {
        const results = await digest.sendDigests({});
        console.log(`[scheduler] digest processed ${results.length} subscription(s)`);
      } catch (err) {
        console.error('[scheduler] digest send failed:', err.message);
      }
    }));
    console.log(`[scheduler] digest registered (${env.scheduler.digestCron})`);
  }

  // 3. Retry sources that failed on their last check.
  if (cron.validate(env.scheduler.retryFailedCron)) {
    jobs.push(cron.schedule(env.scheduler.retryFailedCron, async () => {
      try {
        if (runs.isRunning()) return;
        const result = await runs.runScan({ runType: 'retry', onlyFailed: true });
        console.log(`[scheduler] retry run #${result.runId} ${result.status}`);
      } catch (err) {
        console.error('[scheduler] retry run failed:', err.message);
      }
    }));
    console.log(`[scheduler] retry registered (${env.scheduler.retryFailedCron})`);
  }

  return jobs;
}

module.exports = { start, jobs };
