'use strict';
const service = require('../services/competitors.service');
const sources = require('../services/sources.service');
const audit = require('../services/audit.service');
const { u, withQuery } = require('../utils/nav');

async function listPage(req, res, next) {
  try {
    const data = await service.list(req.query);
    res.render('competitors/list', {
      title: 'Competitors',
      active: 'competitors',
      data,
      filters: req.query,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function detailPage(req, res, next) {
  try {
    const data = await service.detail(req.params.id);
    if (!data) return res.status(404).render('error', { title: 'Not found', statusCode: 404, message: 'Competitor not found.' });
    const history = await audit.forEntity('competitor', req.params.id, 15);
    res.render('competitors/detail', {
      title: data.competitor.name,
      active: 'competitors',
      ...data,
      history,
      catalog: sources.adapterCatalog(),
      watchTargets: sources.WATCH_TARGETS,
      tab: req.query.tab || 'overview',
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function newPage(req, res, next) {
  try {
    res.render('competitors/form', {
      title: 'Add competitor',
      active: 'competitors',
      competitor: null,
      error: null
    });
  } catch (err) { next(err); }
}

async function editPage(req, res, next) {
  try {
    const competitor = await service.get(req.params.id);
    if (!competitor) return res.status(404).render('error', { title: 'Not found', statusCode: 404, message: 'Competitor not found.' });
    res.render('competitors/form', { title: `Edit ${competitor.name}`, active: 'competitors', competitor, error: null });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const id = await service.create(req.body, req.user, req.ip);
    res.redirect(withQuery(`competitors/${id}`, { flash: 'Competitor created with default sources.' }));
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).render('competitors/form', {
        title: 'Add competitor', active: 'competitors', competitor: req.body, error: err.message
      });
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    await service.update(req.params.id, req.body, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { flash: 'Competitor updated.' }));
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).render('competitors/form', {
        title: 'Edit competitor', active: 'competitors',
        competitor: { ...req.body, id: req.params.id }, error: err.message
      });
    }
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    await service.setStatus(req.params.id, req.body.tracking_status, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { flash: `Tracking status set to ${req.body.tracking_status}.` }));
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    await service.remove(req.params.id, req.user, req.ip);
    res.redirect(withQuery('competitors', { flash: 'Competitor deleted.' }));
  } catch (err) { next(err); }
}

async function saveProfile(req, res, next) {
  try {
    await service.saveProfile(req.params.id, req.body, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'profile', flash: 'Strategy profile saved.' }));
  } catch (err) { next(err); }
}

async function addNote(req, res, next) {
  try {
    await service.addNote({ competitorId: req.params.id, body: req.body.body, actor: req.user });
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'notes', flash: 'Note added.' }));
  } catch (err) { next(err); }
}

module.exports = {
  listPage, detailPage, newPage, editPage, create, update, setStatus, remove, saveProfile, addNote
};
