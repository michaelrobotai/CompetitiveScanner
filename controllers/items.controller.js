'use strict';
const service = require('../services/items.service');
const competitors = require('../services/competitors.service');

async function listPage(req, res, next) {
  try {
    const data = await service.list(req.query);
    const competitorOptions = await competitors.all();
    res.render('items/list', {
      title: 'Raw Collected Items',
      active: 'items',
      data,
      competitorOptions,
      filters: req.query,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function detailPage(req, res, next) {
  try {
    const data = await service.get(req.params.id);
    if (!data) return res.status(404).render('error', { title: 'Not found', statusCode: 404, message: 'Collected item not found.' });
    res.render('items/detail', { title: 'Collected item', active: 'items', ...data });
  } catch (err) { next(err); }
}

module.exports = { listPage, detailPage };
