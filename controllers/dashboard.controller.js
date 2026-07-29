'use strict';
const dashboard = require('../services/dashboard.service');
const competitors = require('../services/competitors.service');
const runs = require('../services/runs.service');

async function page(req, res, next) {
  try {
    const data = await dashboard.overview(req.query);
    const competitorOptions = await competitors.all();
    res.render('dashboard', {
      title: 'Radar Home',
      active: 'dashboard',
      data,
      competitorOptions,
      filters: req.query,
      scanning: runs.isRunning(),
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

module.exports = { page };
