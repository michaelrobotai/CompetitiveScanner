'use strict';
const service = require('../services/runs.service');
const competitors = require('../services/competitors.service');
const { withQuery } = require('../utils/nav');

async function listPage(req, res, next) {
  try {
    const data = await service.listRuns(req.query);
    const competitorOptions = await competitors.all();
    res.render('runs/list', {
      title: 'Scan Runs',
      active: 'runs',
      data,
      competitorOptions,
      filters: req.query,
      running: service.isRunning(),
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function detailPage(req, res, next) {
  try {
    const data = await service.getRun(req.params.id);
    if (!data) return res.status(404).render('error', { title: 'Not found', statusCode: 404, message: 'Scan run not found.' });
    res.render('runs/detail', { title: `Scan run #${req.params.id}`, active: 'runs', ...data });
  } catch (err) { next(err); }
}

async function trigger(req, res, next) {
  try {
    const competitorId = req.body.competitorId ? parseInt(req.body.competitorId, 10) : null;
    const result = await service.runScan({
      runType: competitorId ? 'manual_single' : (req.body.onlyFailed ? 'retry' : 'manual_all'),
      competitorId,
      triggeredBy: req.user.id,
      actor: req.user,
      onlyFailed: Boolean(req.body.onlyFailed)
    });
    const back = req.body.returnTo && !/^https?:/i.test(req.body.returnTo) ? req.body.returnTo : `runs/${result.runId}`;
    const msg = `Scan run #${result.runId} ${result.status}: ${result.counters ? result.counters.items : 0} item(s) collected, ${result.signalsCreated || 0} new signal(s), ${result.signalsMerged || 0} merged.`;
    res.redirect(withQuery(back, { flash: msg }));
  } catch (err) {
    if (err.status === 409) {
      return res.redirect(withQuery('runs', { flash: err.message }));
    }
    next(err);
  }
}

module.exports = { listPage, detailPage, trigger };
