'use strict';
const service = require('../services/reports.service');
const competitors = require('../services/competitors.service');
const { withQuery } = require('../utils/nav');

async function page(req, res, next) {
  try {
    const report = await service.generate(req.query);
    const competitorOptions = await competitors.all();
    const saved = await service.listSaved(10);
    res.render('reports/index', {
      title: 'Reports',
      active: 'reports',
      report,
      competitorOptions,
      saved,
      filters: req.query,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function save(req, res, next) {
  try {
    const report = await service.generate(req.body);
    const id = await service.save(report, req.user, req.ip);
    res.redirect(withQuery('reports', {
      from: report.from, to: report.to, competitorId: report.competitorId || '',
      flash: `Report #${id} saved.`
    }));
  } catch (err) { next(err); }
}

async function exportCsv(req, res, next) {
  try {
    const report = await service.generate(req.query);
    const csv = service.toCsv(report);
    const name = report.competitor ? report.competitor.slug : 'all-competitors';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="radar-report-${name}-${report.from}-to-${report.to}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}

module.exports = { page, save, exportCsv };
