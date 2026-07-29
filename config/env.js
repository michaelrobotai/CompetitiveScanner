'use strict';
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true' || raw === '1';
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  // Runtime-managed. No fallback on purpose — server.js fails loudly if absent.
  port: process.env.PORT,
  basePath: process.env.BASE_PATH || '',

  db: {
    host: required(process.env.DB_HOST ? 'DB_HOST' : 'MYSQL_HOST'),
    port: num('DB_PORT', num('MYSQL_PORT', 3306)),
    user: process.env.DB_USER || required('MYSQL_USER'),
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || ''),
    database: process.env.DB_NAME || process.env.DB_DATABASE || required('MYSQL_DATABASE')
  },

  sessionSecret: process.env.SESSION_SECRET || 'competitive-radar-dev-secret',
  demoMode: bool('DEMO_MODE', true),

  scheduler: {
    enabled: bool('SCHEDULER_ENABLED', true),
    dailyScanCron: process.env.DAILY_SCAN_CRON || '0 6 * * *',
    digestCron: process.env.DIGEST_CRON || '15 7 * * *',
    retryFailedCron: process.env.RETRY_FAILED_CRON || '0 */3 * * *'
  },

  signals: {
    minConfidence: num('SIGNAL_MIN_CONFIDENCE', 45),
    alertMinImpact: num('ALERT_MIN_IMPACT', 80),
    alertMinConfidence: num('ALERT_MIN_CONFIDENCE', 70),
    dedupeWindowHours: num('DEDUPE_WINDOW_HOURS', 72)
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num('SMTP_PORT', 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    secure: bool('SMTP_SECURE', false),
    from: process.env.DIGEST_FROM || 'radar@competitive-radar.local'
  },

  apiKeys: {
    NEWS_API_KEY: process.env.NEWS_API_KEY || '',
    LINKEDIN_API_KEY: process.env.LINKEDIN_API_KEY || '',
    LINKEDIN_EXEC_API_KEY: process.env.LINKEDIN_EXEC_API_KEY || '',
    JOBS_API_KEY: process.env.JOBS_API_KEY || '',
    FUNDING_API_KEY: process.env.FUNDING_API_KEY || '',
    SEC_API_KEY: process.env.SEC_API_KEY || '',
    REVIEW_API_KEY: process.env.REVIEW_API_KEY || '',
    SOCIAL_API_KEY: process.env.SOCIAL_API_KEY || ''
  }
};

env.smtpConfigured = Boolean(env.smtp.host && env.smtp.host.trim());

module.exports = env;
