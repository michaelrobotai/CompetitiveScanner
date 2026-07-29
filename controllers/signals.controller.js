'use strict';
const service = require('../services/signals.service');
const competitors = require('../services/competitors.service');
const { withQuery } = require('../utils/nav');

async function listPage(req, res, next) {
  try {
    const data = await service.list(req.query);
    const counts = await service.categoryCounts(req.query);
    const competitorOptions = await competitors.all();
    res.render('signals/list', {
      title: 'Signals Feed',
      active: 'signals',
      data,
      counts,
      competitorOptions,
      filters: req.query,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function detailPage(req, res, next) {
  try {
    const data = await service.get(req.params.id);
    if (!data) return res.status(404).render('error', { title: 'Not found', statusCode: 404, message: 'Signal not found.' });
    const siblings = await service.list({ competitorId: data.signal.competitor_id, perPage: 10 });
    res.render('signals/detail', {
      title: data.signal.title,
      active: 'signals',
      ...data,
      siblings: siblings.rows.filter((s) => String(s.id) !== String(req.params.id)),
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function review(req, res, next) {
  try {
    await service.review(req.params.id, { status: req.body.status, note: req.body.note }, req.user, req.ip);
    res.redirect(withQuery(`signals/${req.params.id}`, { flash: `Signal marked as ${req.body.status}.` }));
  } catch (err) { next(err); }
}

async function merge(req, res, next) {
  try {
    await service.merge(req.params.id, req.body.targetId, req.user, req.ip);
    res.redirect(withQuery(`signals/${req.body.targetId}`, { flash: `Signal #${req.params.id} merged into this signal.` }));
  } catch (err) { next(err); }
}

async function addNote(req, res, next) {
  try {
    await competitors.addNote({ signalId: req.params.id, body: req.body.body, actor: req.user });
    res.redirect(withQuery(`signals/${req.params.id}`, { flash: 'Note added.' }));
  } catch (err) { next(err); }
}

module.exports = { listPage, detailPage, review, merge, addNote };
