'use strict';
const express = require('express');
const { requireAuth, requirePermission } = require('../../middleware/auth');
const competitorsSvc = require('../../services/competitors.service');
const sourcesSvc = require('../../services/sources.service');
const signalsSvc = require('../../services/signals.service');
const itemsSvc = require('../../services/items.service');
const runsSvc = require('../../services/runs.service');
const digestSvc = require('../../services/digest.service');
const reportsSvc = require('../../services/reports.service');
const usersSvc = require('../../services/users.service');
const auditSvc = require('../../services/audit.service');
const dashboardSvc = require('../../services/dashboard.service');
const { httpError } = require('../../middleware/errors');

const router = express.Router();

router.get('/health', async (req, res) => {
  res.json({ status: 'ok', service: 'competitive-radar', time: new Date().toISOString() });
});

router.use(requireAuth);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Session ────────────────────────────────────────────────────────────────
router.get('/me', (req, res) => res.json({ user: req.user }));

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/dashboard', requirePermission('dashboard.view'), wrap(async (req, res) => {
  res.json(await dashboardSvc.overview(req.query));
}));

// ── Competitors ────────────────────────────────────────────────────────────
router.get('/competitors', requirePermission('competitors.view'), wrap(async (req, res) => {
  res.json(await competitorsSvc.list(req.query));
}));
router.post('/competitors', requirePermission('competitors.manage'), wrap(async (req, res) => {
  const id = await competitorsSvc.create(req.body, req.user, req.ip);
  res.status(201).json({ id, competitor: await competitorsSvc.get(id) });
}));
router.get('/competitors/:id', requirePermission('competitors.view'), wrap(async (req, res) => {
  const data = await competitorsSvc.detail(req.params.id);
  if (!data) throw httpError(404, 'Competitor not found', 'not_found');
  res.json(data);
}));
router.put('/competitors/:id', requirePermission('competitors.manage'), wrap(async (req, res) => {
  await competitorsSvc.update(req.params.id, req.body, req.user, req.ip);
  res.json({ ok: true, competitor: await competitorsSvc.get(req.params.id) });
}));
router.patch('/competitors/:id/tracking', requirePermission('competitors.manage'), wrap(async (req, res) => {
  await competitorsSvc.setStatus(req.params.id, req.body.tracking_status, req.user, req.ip);
  res.json({ ok: true });
}));
router.delete('/competitors/:id', requirePermission('competitors.delete'), wrap(async (req, res) => {
  await competitorsSvc.remove(req.params.id, req.user, req.ip);
  res.json({ ok: true });
}));
router.put('/competitors/:id/profile', requirePermission('competitors.manage'), wrap(async (req, res) => {
  await competitorsSvc.saveProfile(req.params.id, req.body, req.user, req.ip);
  res.json({ ok: true });
}));
router.post('/competitors/:id/notes', requirePermission('notes.create'), wrap(async (req, res) => {
  const id = await competitorsSvc.addNote({ competitorId: req.params.id, body: req.body.body, actor: req.user });
  res.status(201).json({ id });
}));

// ── Sources ────────────────────────────────────────────────────────────────
router.get('/competitors/:id/sources', requirePermission('competitors.view'), wrap(async (req, res) => {
  res.json({ rows: await sourcesSvc.forCompetitor(req.params.id) });
}));
router.post('/competitors/:id/sources', requirePermission('sources.manage'), wrap(async (req, res) => {
  const id = await sourcesSvc.create(req.params.id, req.body, req.user, req.ip);
  res.status(201).json({ id });
}));
router.put('/sources/:sourceId', requirePermission('sources.manage'), wrap(async (req, res) => {
  await sourcesSvc.update(req.params.sourceId, req.body, req.user, req.ip);
  res.json({ ok: true });
}));
router.delete('/sources/:sourceId', requirePermission('sources.manage'), wrap(async (req, res) => {
  await sourcesSvc.remove(req.params.sourceId, req.user, req.ip);
  res.json({ ok: true });
}));
router.get('/connectors', requirePermission('items.view'), wrap(async (req, res) => {
  res.json({ rows: await sourcesSvc.listConnectors(), catalog: sourcesSvc.adapterCatalog() });
}));
router.put('/connectors/:key', requirePermission('connectors.manage'), wrap(async (req, res) => {
  await sourcesSvc.updateConnector(req.params.key, req.body, req.user, req.ip);
  res.json({ ok: true });
}));

// ── Signals ────────────────────────────────────────────────────────────────
router.get('/signals', requirePermission('signals.view'), wrap(async (req, res) => {
  res.json(await signalsSvc.list(req.query));
}));
router.get('/signals/:id', requirePermission('signals.view'), wrap(async (req, res) => {
  const data = await signalsSvc.get(req.params.id);
  if (!data) throw httpError(404, 'Signal not found', 'not_found');
  res.json(data);
}));
router.patch('/signals/:id/review', requirePermission('signals.triage'), wrap(async (req, res) => {
  await signalsSvc.review(req.params.id, { status: req.body.status, note: req.body.note }, req.user, req.ip);
  res.json({ ok: true });
}));
router.post('/signals/:id/merge', requirePermission('signals.triage'), wrap(async (req, res) => {
  await signalsSvc.merge(req.params.id, req.body.targetId, req.user, req.ip);
  res.json({ ok: true });
}));

// ── Raw collected items ────────────────────────────────────────────────────
router.get('/collected-items', requirePermission('items.view'), wrap(async (req, res) => {
  res.json(await itemsSvc.list(req.query));
}));
router.get('/collected-items/:id', requirePermission('items.view'), wrap(async (req, res) => {
  const data = await itemsSvc.get(req.params.id);
  if (!data) throw httpError(404, 'Item not found', 'not_found');
  res.json(data);
}));

// ── Scan runs ──────────────────────────────────────────────────────────────
router.get('/scan-runs', requirePermission('runs.view'), wrap(async (req, res) => {
  res.json(await runsSvc.listRuns(req.query));
}));
router.get('/scan-runs/:id', requirePermission('runs.view'), wrap(async (req, res) => {
  const data = await runsSvc.getRun(req.params.id);
  if (!data) throw httpError(404, 'Scan run not found', 'not_found');
  res.json(data);
}));
router.post('/scan-runs/trigger-run', requirePermission('runs.trigger'), wrap(async (req, res) => {
  const competitorId = req.body.competitorId ? parseInt(req.body.competitorId, 10) : null;
  const result = await runsSvc.runScan({
    runType: competitorId ? 'manual_single' : (req.body.onlyFailed ? 'retry' : 'manual_all'),
    competitorId,
    triggeredBy: req.user.id,
    actor: req.user,
    onlyFailed: Boolean(req.body.onlyFailed)
  });
  res.status(202).json(result);
}));

// ── Digests ────────────────────────────────────────────────────────────────
router.get('/digests', requirePermission('digest.view'), wrap(async (req, res) => {
  res.json({ rows: await digestSvc.listSubscriptions(), logs: await digestSvc.notificationLog(20) });
}));
router.post('/digests', requirePermission('digest.manage'), wrap(async (req, res) => {
  const id = await digestSvc.createSubscription(req.body, req.user, req.ip);
  res.status(201).json({ id });
}));
router.put('/digests/:id', requirePermission('digest.manage'), wrap(async (req, res) => {
  await digestSvc.updateSubscription(req.params.id, req.body, req.user, req.ip);
  res.json({ ok: true });
}));
router.delete('/digests/:id', requirePermission('digest.manage'), wrap(async (req, res) => {
  await digestSvc.deleteSubscription(req.params.id, req.user, req.ip);
  res.json({ ok: true });
}));
router.post('/digests/send', requirePermission('digest.manage'), wrap(async (req, res) => {
  res.json({ results: await digestSvc.sendDigests({ force: true, subscriptionId: req.body.subscriptionId || null, actor: req.user }) });
}));

// ── Reports ────────────────────────────────────────────────────────────────
router.get('/reports', requirePermission('reports.view'), wrap(async (req, res) => {
  res.json(await reportsSvc.generate(req.query));
}));
router.get('/reports/saved', requirePermission('reports.view'), wrap(async (req, res) => {
  res.json({ rows: await reportsSvc.listSaved(25) });
}));
router.post('/reports', requirePermission('reports.generate'), wrap(async (req, res) => {
  const report = await reportsSvc.generate(req.body);
  const id = await reportsSvc.save(report, req.user, req.ip);
  res.status(201).json({ id, report });
}));

// ── Users ──────────────────────────────────────────────────────────────────
router.get('/users', requirePermission('users.manage'), wrap(async (req, res) => {
  res.json({ rows: await usersSvc.list() });
}));
router.post('/users', requirePermission('users.manage'), wrap(async (req, res) => {
  const id = await usersSvc.create(req.body, req.user, req.ip);
  res.status(201).json({ id });
}));
router.put('/users/:id', requirePermission('users.manage'), wrap(async (req, res) => {
  await usersSvc.update(req.params.id, req.body, req.user, req.ip);
  res.json({ ok: true });
}));
router.delete('/users/:id', requirePermission('users.manage'), wrap(async (req, res) => {
  await usersSvc.remove(req.params.id, req.user, req.ip);
  res.json({ ok: true });
}));

// ── Audit log ──────────────────────────────────────────────────────────────
router.get('/audit-logs', requirePermission('audit.view'), wrap(async (req, res) => {
  res.json(await auditSvc.list(req.query));
}));

module.exports = router;
