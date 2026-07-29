'use strict';
const https = require('https');
const http = require('http');
const { URL } = require('url');

const TIMEOUT_MS = 8000;
const UA = 'CompetitiveRadarBot/1.0 (+competitive-radar; contact=radar@competitive-radar.local)';
const robotsCache = new Map();

function request(targetUrl, { method = 'GET', headers = {}, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (_) {
      return resolve({ ok: false, error: 'Invalid URL' });
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, {
      method,
      headers: { 'User-Agent': UA, Accept: '*/*', ...headers },
      timeout
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 1024 * 512) chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `Timeout after ${timeout}ms` }); });
    req.on('error', (err) => resolve({ ok: false, error: err.message || 'Network error' }));
    req.end();
  });
}

async function robotsAllows(targetUrl) {
  let parsed;
  try { parsed = new URL(targetUrl); } catch (_) { return true; }
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!robotsCache.has(origin)) {
    const res = await request(`${origin}/robots.txt`, { timeout: 4000 });
    robotsCache.set(origin, res.ok ? String(res.body || '') : '');
  }
  const txt = robotsCache.get(origin);
  if (!txt) return true;

  // Minimal robots parsing for the '*' user-agent group.
  const lines = txt.split('\n').map((l) => l.trim());
  let inStar = false;
  const disallows = [];
  for (const line of lines) {
    if (/^user-agent:/i.test(line)) {
      inStar = /:\s*\*\s*$/.test(line);
      continue;
    }
    if (inStar && /^disallow:/i.test(line)) {
      const path = line.split(':').slice(1).join(':').trim();
      if (path) disallows.push(path);
    }
  }
  return !disallows.some((d) => parsed.pathname.startsWith(d));
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// fetchPage is injected into every adapter as ctx.fetchPage.
async function fetchPage(targetUrl, { raw = false, respectRobots = true } = {}) {
  if (!targetUrl) return { ok: false, error: 'No URL supplied' };
  if (respectRobots) {
    const allowed = await robotsAllows(targetUrl);
    if (!allowed) return { ok: false, robotsBlocked: true, error: 'Disallowed by robots.txt' };
  }
  const res = await request(targetUrl);
  if (!res.ok) {
    const rateLimited = res.statusCode === 429 || res.statusCode === 503;
    return { ok: false, rateLimited, statusCode: res.statusCode, error: res.error || `HTTP ${res.statusCode}` };
  }
  return {
    ok: true,
    statusCode: res.statusCode,
    body: res.body,
    text: raw ? res.body : stripHtml(res.body)
  };
}

module.exports = { fetchPage, request, stripHtml, robotsAllows };
