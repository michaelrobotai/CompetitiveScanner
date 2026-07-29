
'use strict';
const service = require('../services/sources.service');
const { withQuery } = require('../utils/nav');

async function settingsPage(req, res, next) {
  try {
    const connectors = await service.listConnectors();
    res.render('settings/sources', {
      title: 'Sources & Integrations',
      active: 'sources',
      connectors,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function updateConnector(req, res, next) {
  try {
    await service.updateConnector(req.params.key, req.body, req.user, req.ip);
    res.redirect(withQuery('settings/sources', { flash: `Connector "${req.params.key}" updated.` }));
  } catch (err) { next(err); }
}

async function createForCompetitor(req, res, next) {
  try {
    await service.create(req.params.id, req.body, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'sources', flash: 'Source added.' }));
  } catch (err) { next(err); }
}

async function updateForCompetitor(req, res, next) {
  try {
    await service.update(req.params.sourceId, req.body, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'sources', flash: 'Source updated.' }));
  } catch (err) { next(err); }
}

async function toggleForCompetitor(req, res, next) {
  try {
    const next_ = await service.toggle(req.params.sourceId, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'sources', flash: next_ ? 'Source enabled.' : 'Source disabled.' }));
  } catch (err) { next(err); }
}

async function removeForCompetitor(req, res, next) {
  try {
    await service.remove(req.params.sourceId, req.user, req.ip);
    res.redirect(withQuery(`competitors/${req.params.id}`, { tab: 'sources', flash: 'Source removed.' }));
  } catch (err) { next(err); }
}

module.exports = {
  settingsPage, updateConnector, createForCompetitor,
  updateForCompetitor, toggleForCompetitor, removeForCompetitor
};
