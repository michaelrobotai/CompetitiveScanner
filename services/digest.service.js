'use strict';
const db = require('../config/db');
const env = require('../config/env');
const audit = require('./audit.service');
const { SIGNAL_TYPES } = require('../utils/format');

const ALL_CATEGORIES = Object.keys(SIGNAL_TYPES);

let transportPromise = null;
async function getTransport() {
  if (!env.smtpConfigured) return null;
  if (!transportPromise) {
    transportPromise = (async () => {
      const nodemailer = require('nodemailer');
      return nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined
      });
    })();
  }
  return transportPromise;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function listSubscriptions() {
  const rows = await db.query(
    `SELECT ds.*, u.full_name AS user_name FROM digest_subscriptions ds
       LEFT JOIN users u ON u.id = ds.user_id ORDER BY ds.enabled DESC, ds.recipient_email`
  );
  return rows.map((r) => ({
    ...r,
    categories: parseJson(r.categories_json, ALL_CATEGORIES),
    competitorIds: parseJson(r.competitors_json, [])
  }));
}

async function getSubscription(id) {
  const row = await db.one('SELECT * FROM digest_subscriptions WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, categories: parseJson(row.categories_json, ALL_CATEGORIES), competitorIds: parseJson(row.competitors_json, []) };
}

function normalizeBody(body) {
  const categories = []
    .concat(body.categories || [])
    .filter((c) => ALL_CATEGORIES.includes(c));
  const competitorIds = []
    .concat(body.competitorIds || [])
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
  return {
    recipient_name: body.recipient_name ? String(body.recipient_name).slice(0, 150) : null,
    recipient_email: String(body.recipient_email || '').trim().toLowerCase(),
    frequency: body.frequency === 'weekly' ? 'weekly' : 'daily',
    send_time: /^\d{2}:\d{2}$/.test(body.send_time || '') ? body.send_time : '07:15',
    timezone: body.timezone ? String(body.timezone).slice(0, 60) : 'UTC',
    min_confidence: Math.max(0, Math.min(100, parseInt(body.min_confidence, 10) || 50)),
    categories_json: JSON.stringify(categories.length ? categories : ALL_CATEGORIES),
    competitors_json: JSON.stringify(competitorIds),
    include_raw_items: body.include_raw_items ? 1 : 0,
    instant_alerts: body.instant_alerts ? 1 : 0,
    enabled: body.enabled === undefined ? 1 : (body.enabled ? 1 : 0)
  };
}

async function createSubscription(body, actor, ip) {
  const data = normalizeBody(body);
  if (!data.recipient_email || !data.recipient_email.includes('@')) {
    const err = new Error('A valid recipient email is required'); err.status = 400; err.expose = true; throw err;
  }
  const result = await db.exec(
    `INSERT INTO digest_subscriptions (user_id, recipient_name, recipient_email, frequency, send_time, timezone,
       min_confidence, categories_json, competitors_json, include_raw_items, instant_alerts, enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      body.user_id ? parseInt(body.user_id, 10) : null,
      data.recipient_name, data.recipient_email, data.frequency, data.send_time, data.timezone,
      data.min_confidence, data.categories_json, data.competitors_json,
      data.include_raw_items, data.instant_alerts, data.enabled
    ]
  );
  await audit.log({ actor, action: 'create', entityType: 'digest_subscription', entityId: result.insertId, entityLabel: data.recipient_email, details: data, ip });
  return result.insertId;
}

async function updateSubscription(id, body, actor, ip) {
  const existing = await getSubscription(id);
  if (!existing) { const err = new Error('Subscription not found'); err.status = 404; err.expose = true; throw err; }
  const data = normalizeBody({ ...body, recipient_email: body.recipient_email || existing.recipient_email });
  await db.exec(
    `UPDATE digest_subscriptions SET recipient_name=?, recipient_email=?, frequency=?, send_time=?, timezone=?,
       min_confidence=?, categories_json=?, competitors_json=?, include_raw_items=?, instant_alerts=?, enabled=?
     WHERE id=?`,
    [
      data.recipient_name, data.recipient_email, data.frequency, data.send_time, data.timezone,
      data.min_confidence, data.categories_json, data.competitors_json,
      data.include_raw_items, data.instant_alerts, data.enabled, id
    ]
  );
  await audit.log({ actor, action: 'update', entityType: 'digest_subscription', entityId: id, entityLabel: data.recipient_email, details: data, ip });
}

async function deleteSubscription(id, actor, ip) {
  const existing = await getSubscription(id);
  if (!existing) { const err = new Error('Subscription not found'); err.status = 404; err.expose = true; throw err; }
  await db.exec('DELETE FROM digest_subscriptions WHERE id = ?', [id]);
  await audit.log({ actor, action: 'delete', entityType: 'digest_subscription', entityId: id, entityLabel: existing.recipient_email, details: {}, ip });
}

async function signalsForSubscription(sub, sinceHours) {
  const params = [sub.min_confidence];
  const where = ["s.status NOT IN ('merged','dismissed')", 's.confidence >= ?'];
  where.push(`s.detected_at >= (NOW() - INTERVAL ${Number(sinceHours) || 24} HOUR)`);
  const cats = sub.categories && sub.categories.length ? sub.categories : ALL_CATEGORIES;
  where.push(`s.signal_type IN (${cats.map(() => '?').join(',')})`);
  params.push(...cats);
  if (sub.competitorIds && sub.competitorIds.length) {
    where.push(`s.competitor_id IN (${sub.competitorIds.map(() => '?').join(',')})`);
    params.push(...sub.competitorIds);
  }
  return db.query(
    `SELECT s.*, c.name AS competitor_name FROM signals s
       JOIN competitors c ON c.id = s.competitor_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.confidence DESC, s.detected_at DESC LIMIT 40`,
    params
  );
}

function renderDigestHtml({ sub, signals, title }) {
  const rows = signals.map((s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e8ee;">
        <div style="font-weight:600;color:#111827;">${escapeHtml(s.competitor_name)}</div>
        <div style="color:#374151;">${escapeHtml(s.title)}</div>
        <div style="color:#6b7280;font-size:12px;margin-top:4px;">${escapeHtml((s.summary || '').slice(0, 220))}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e8ee;white-space:nowrap;">
        ${escapeHtml(SIGNAL_TYPES[s.signal_type] ? SIGNAL_TYPES[s.signal_type].label : s.signal_type)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e8ee;text-align:center;font-weight:700;">${s.confidence}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e8ee;text-transform:capitalize;">${s.severity}</td>
    </tr>`).join('');

  return `<!doctype html><html><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f5f8;padding:24px;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e8ee;">
    <div style="background:#0f172a;color:#ffffff;padding:20px 24px;">
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8fa3c8;">Competitive Radar</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(title)}</div>
    </div>
    <div style="padding:20px 24px;">
      <p style="color:#374151;margin:0 0 16px;">Hello ${escapeHtml(sub.recipient_name || 'there')}, ${signals.length} signal(s) matched your digest settings (minimum confidence ${sub.min_confidence}).</p>
      ${signals.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f4f5f8;text-align:left;">
          <th style="padding:10px 12px;">Signal</th><th style="padding:10px 12px;">Category</th>
          <th style="padding:10px 12px;">Conf.</th><th style="padding:10px 12px;">Severity</th>
        </tr></thead><tbody>${rows}</tbody></table>`
    : '<p style="color:#6b7280;">No signals crossed your thresholds in this period.</p>'}
    </div>
    <div style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
      You are receiving this because your address is subscribed in Competitive Radar digest settings.
    </div>
  </div></body></html>`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function deliver({ sub, subject, html, text, signalCount, type }) {
  const transport = await getTransport();
  if (!transport) {
    await db.exec(
      `INSERT INTO notification_logs (subscription_id, channel, notification_type, recipient, subject, body_preview, signal_count, status)
       VALUES (?,'email',?,?,?,?,?,'logged_only')`,
      [sub.id || null, type, sub.recipient_email, subject, String(text || '').slice(0, 2000), signalCount]
    );
    return { status: 'logged_only' };
  }
  try {
    await transport.sendMail({ from: env.smtp.from, to: sub.recipient_email, subject, html, text });
    await db.exec(
      `INSERT INTO notification_logs (subscription_id, channel, notification_type, recipient, subject, body_preview, signal_count, status)
       VALUES (?,'email',?,?,?,?,?,'sent')`,
      [sub.id || null, type, sub.recipient_email, subject, String(text || '').slice(0, 2000), signalCount]
    );
    return { status: 'sent' };
  } catch (err) {
    await db.exec(
      `INSERT INTO notification_logs (subscription_id, channel, notification_type, recipient, subject, body_preview, signal_count, status, error)
       VALUES (?,'email',?,?,?,?,?,'failed',?)`,
      [sub.id || null, type, sub.recipient_email, subject, String(text || '').slice(0, 2000), signalCount, String(err.message).slice(0, 500)]
    );
    return { status: 'failed', error: err.message };
  }
}

async function sendDigests({ force = false, subscriptionId = null, actor = null } = {}) {
  let subs = await listSubscriptions();
  if (subscriptionId) subs = subs.filter((s) => String(s.id) === String(subscriptionId));
  const results = [];
  for (const sub of subs) {
    if (!sub.enabled && !force) { results.push({ id: sub.id, skipped: 'disabled' }); continue; }
    const hours = sub.frequency === 'weekly' ? 168 : 24;
    const signals = await signalsForSubscription(sub, hours);
    if (!signals.length && !force) {
      await db.exec(
        `INSERT INTO notification_logs (subscription_id, channel, notification_type, recipient, subject, signal_count, status)
         VALUES (?,'email',?,?,?,0,'skipped')`,
        [sub.id, sub.frequency === 'weekly' ? 'weekly_digest' : 'daily_digest', sub.recipient_email, 'No qualifying signals']
      );
      results.push({ id: sub.id, skipped: 'no_signals' });
      continue;
    }
    const title = sub.frequency === 'weekly' ? 'Weekly competitive digest' : 'Daily competitive digest';
    const subject = `[Competitive Radar] ${title} — ${signals.length} signal(s)`;
    const html = renderDigestHtml({ sub, signals, title });
    const text = signals.map((s) => `- ${s.competitor_name}: ${s.title} (confidence ${s.confidence}, ${s.severity})`).join('\n');
    const outcome = await deliver({
      sub, subject, html, text, signalCount: signals.length,
      type: sub.frequency === 'weekly' ? 'weekly_digest' : 'daily_digest'
    });
    await db.exec('UPDATE digest_subscriptions SET last_sent_at = NOW() WHERE id = ?', [sub.id]);
    results.push({ id: sub.id, recipient: sub.recipient_email, signals: signals.length, ...outcome });
  }
  if (actor) {
    await audit.log({ actor, action: 'send_digest', entityType: 'digest_subscription', entityId: subscriptionId || 'all', entityLabel: 'Manual digest send', details: { results } });
  }
  return results;
}

async function sendInstantAlert(signalId) {
  const signal = await db.one(
    `SELECT s.*, c.name AS competitor_name FROM signals s
       JOIN competitors c ON c.id = s.competitor_id WHERE s.id = ?`,
    [signalId]
  );
  if (!signal) return { status: 'missing' };
  const subs = (await listSubscriptions()).filter((s) => s.enabled && s.instant_alerts
    && signal.confidence >= s.min_confidence
    && (!s.categories.length || s.categories.includes(signal.signal_type))
    && (!s.competitorIds.length || s.competitorIds.includes(signal.competitor_id)));

  const results = [];
  for (const sub of subs) {
    const subject = `[Competitive Radar] URGENT: ${signal.competitor_name} — ${signal.title}`;
    const html = renderDigestHtml({ sub, signals: [signal], title: 'High-impact signal alert' });
    const text = `${signal.competitor_name}: ${signal.title}\nConfidence ${signal.confidence}, impact ${signal.impact}, severity ${signal.severity}\n\n${signal.summary || ''}`;
    results.push(await deliver({ sub, subject, html, text, signalCount: 1, type: 'instant_alert' }));
  }
  await db.exec('UPDATE signals SET alert_sent = 1 WHERE id = ?', [signalId]);
  return { status: 'processed', recipients: results.length, results };
}

async function notificationLog(limit = 50) {
  return db.query(
    `SELECT nl.*, ds.recipient_email AS sub_email FROM notification_logs nl
       LEFT JOIN digest_subscriptions ds ON ds.id = nl.subscription_id
      ORDER BY nl.sent_at DESC LIMIT ?`,
    [limit]
  );
}

module.exports = {
  ALL_CATEGORIES,
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  sendDigests,
  sendInstantAlert,
  notificationLog
};
