'use strict';
const { sha256 } = require('../../utils/hash');

// ── Source adapter interface ────────────────────────────────────────────────
// Every adapter exports:
//   key                : connector_key (matches source_connectors.connector_key)
//   name               : human label
//   category           : grouping for the Sources & Integrations screen
//   authType           : 'none' | 'api_key' | 'scrape'
//   envKey             : name of the env var holding the credential (or null)
//   credibility        : 0-100 base credibility weight used by the signal engine
//   isConfigured(env)  : boolean — false => run reports 'not_configured'
//   collect(ctx)       : async => { status, items[], error?, note? }
//
// ctx = { competitor, source, env, demoMode, fetchPage, mock, now }
// Returned item shape:
//   { title, url, author, excerpt, rawContent, publishedAt, changeType,
//     diffSummary, contentHash?, credibility?, typeGuess?, isMock }
// ---------------------------------------------------------------------------

const STATUS = {
  OK: 'ok',
  ERROR: 'error',
  NOT_CONFIGURED: 'not_configured',
  SKIPPED: 'skipped',
  RATE_LIMITED: 'rate_limited',
  ROBOTS_BLOCKED: 'robots_blocked'
};

function makeItem(partial) {
  const item = {
    title: partial.title || 'Untitled item',
    url: partial.url || null,
    author: partial.author || null,
    excerpt: partial.excerpt || null,
    rawContent: partial.rawContent || partial.excerpt || null,
    publishedAt: partial.publishedAt || new Date(),
    changeType: partial.changeType || 'new',
    diffSummary: partial.diffSummary || null,
    credibility: partial.credibility != null ? partial.credibility : 60,
    typeGuess: partial.typeGuess || null,
    isMock: partial.isMock ? 1 : 0
  };
  item.contentHash = partial.contentHash || sha256(`${item.title}|${item.url || ''}|${(item.rawContent || '').slice(0, 4000)}`);
  return item;
}

function defineAdapter(def) {
  return {
    key: def.key,
    name: def.name,
    category: def.category,
    authType: def.authType || 'none',
    envKey: def.envKey || null,
    credibility: def.credibility != null ? def.credibility : 60,
    description: def.description || '',
    respectsRobots: def.respectsRobots !== false,
    rateLimitPerHour: def.rateLimitPerHour || 60,
    isConfigured(env) {
      if (typeof def.isConfigured === 'function') return def.isConfigured(env);
      if (!def.envKey) return true;
      return Boolean(env.apiKeys[def.envKey] && String(env.apiKeys[def.envKey]).trim());
    },
    async collect(ctx) {
      return def.collect(ctx);
    }
  };
}

module.exports = { STATUS, makeItem, defineAdapter };
