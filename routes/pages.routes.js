'use strict';
const express = require('express');
const { requireAuth, requirePermission } = require('../middleware/auth');
const dashboard = require('../controllers/dashboard.controller');
const competitors = require('../controllers/competitors.controller');
const sources = require('../controllers/sources.controller');
const signals = require('../controllers/signals.controller');
const items = require('../controllers/items.controller');
const runs = require('../controllers/runs.controller');
const digest = require('../controllers/digest.controller');
const reports = require('../controllers/reports.controller');
const users = require('../controllers/users.controller');
const audit = require('../controllers/audit.controller');

const router = express.Router();
router.use(requireAuth);

// Dashboard (Radar Home)
router.get('/', (req, res) => res.redirect(require('../utils/nav').u('dashboard')));
router.get('/dashboard', requirePermission('dashboard.view'), dashboard.page);

// Competitors
router.get('/competitors', requirePermission('competitors.view'), competitors.listPage);
router.get('/competitors/new', requirePermission('competitors.manage'), competitors.newPage);
router.post('/competitors', requirePermission('competitors.manage'), competitors.create);
router.get('/competitors/:id', requirePermission('competitors.view'), competitors.detailPage);
router.get('/competitors/:id/edit', requirePermission('competitors.manage'), competitors.editPage);
router.post('/competitors/:id', requirePermission('competitors.manage'), competitors.update);
router.post('/competitors/:id/status', requirePermission('competitors.manage'), competitors.setStatus);
router.post('/competitors/:id/delete', requirePermission('competitors.delete'), competitors.remove);
router.post('/competitors/:id/profile', requirePermission('competitors.manage'), competitors.saveProfile);
router.post('/competitors/:id/notes', requirePermission('notes.create'), competitors.addNote);

// Competitor sources
router.post('/competitors/:id/sources', requirePermission('sources.manage'), sources.createForCompetitor);
router.post('/competitors/:id/sources/:sourceId', requirePermission('sources.manage'), sources.updateForCompetitor);
router.post('/competitors/:id/sources/:sourceId/toggle', requirePermission('sources.manage'), sources.toggleForCompetitor);
router.post('/competitors/:id/sources/:sourceId/delete', requirePermission('sources.manage'), sources.removeForCompetitor);

// Signals
router.get('/signals', requirePermission('signals.view'), signals.listPage);
router.get('/signals/:id', requirePermission('signals.view'), signals.detailPage);
router.post('/signals/:id/review', requirePermission('signals.triage'), signals.review);
router.post('/signals/:id/merge', requirePermission('signals.triage'), signals.merge);
router.post('/signals/:id/notes', requirePermission('notes.create'), signals.addNote);

// Raw collected items
router.get('/items', requirePermission('items.view'), items.listPage);
router.get('/items/:id', requirePermission('items.view'), items.detailPage);

// Scan runs
router.get('/runs', requirePermission('runs.view'), runs.listPage);
router.post('/runs/trigger', requirePermission('runs.trigger'), runs.trigger);
router.get('/runs/:id', requirePermission('runs.view'), runs.detailPage);

// Reports
router.get('/reports', requirePermission('reports.view'), reports.page);
router.get('/reports/export', requirePermission('reports.view'), reports.exportCsv);
router.post('/reports/save', requirePermission('reports.generate'), reports.save);

// Settings — sources & integrations (admin)
router.get('/settings/sources', requirePermission('connectors.manage'), sources.settingsPage);
router.post('/settings/sources/:key', requirePermission('connectors.manage'), sources.updateConnector);

// Settings — digest & notifications
router.get('/settings/digest', requirePermission('digest.view'), digest.page);
router.post('/settings/digest', requirePermission('digest.manage'), digest.create);
router.post('/settings/digest/send', requirePermission('digest.manage'), digest.sendNow);
router.post('/settings/digest/:id', requirePermission('digest.manage'), digest.update);
router.post('/settings/digest/:id/delete', requirePermission('digest.manage'), digest.remove);

// Settings — users & roles (admin)
router.get('/settings/users', requirePermission('users.manage'), users.page);
router.post('/settings/users', requirePermission('users.manage'), users.create);
router.post('/settings/users/:id', requirePermission('users.manage'), users.update);
router.post('/settings/users/:id/delete', requirePermission('users.manage'), users.remove);

// Audit log (admin)
router.get('/settings/audit', requirePermission('audit.view'), audit.page);

module.exports = router;
