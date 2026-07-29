'use strict';
const service = require('../services/audit.service');

async function page(req, res, next) {
  try {
    const data = await service.list(req.query);
    res.render('settings/audit', {
      title: 'Audit Log',
      active: 'audit',
      data,
      filters: req.query
    });
  } catch (err) { next(err); }
}

module.exports = { page };
