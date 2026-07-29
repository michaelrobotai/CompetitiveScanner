'use strict';
const service = require('../services/digest.service');
const competitors = require('../services/competitors.service');
const users = require('../services/users.service');
const { withQuery } = require('../utils/nav');

async function page(req, res, next) {
  try {
    const [subscriptions, competitorOptions, userOptions, logs] = await Promise.all([
      service.listSubscriptions(),
      competitors.all(),
      users.list(),
      service.notificationLog(30)
    ]);
    res.render('settings/digest', {
      title: 'Digest & Notifications',
      active: 'digest',
      subscriptions,
      competitorOptions,
      userOptions,
      logs,
      categories: service.ALL_CATEGORIES,
      editId: req.query.edit ? parseInt(req.query.edit, 10) : null,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

function collectBody(body) {
  return {
    ...body,
    categories: body.categories ? [].concat(body.categories) : [],
    competitorIds: body.competitorIds ? [].concat(body.competitorIds) : [],
    include_raw_items: body.include_raw_items === 'on' || body.include_raw_items === true,
    instant_alerts: body.instant_alerts === 'on' || body.instant_alerts === true,
    enabled: body.enabled === 'on' || body.enabled === true
  };
}

async function create(req, res, next) {
  try {
    await service.createSubscription(collectBody(req.body), req.user, req.ip);
    res.redirect(withQuery('settings/digest', { flash: 'Digest subscription created.' }));
  } catch (err) {
    if (err.status === 400) return res.redirect(withQuery('settings/digest', { flash: err.message }));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    await service.updateSubscription(req.params.id, collectBody(req.body), req.user, req.ip);
    res.redirect(withQuery('settings/digest', { flash: 'Digest subscription updated.' }));
  } catch (err) {
    if (err.status === 400) return res.redirect(withQuery('settings/digest', { flash: err.message }));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteSubscription(req.params.id, req.user, req.ip);
    res.redirect(withQuery('settings/digest', { flash: 'Digest subscription removed.' }));
  } catch (err) { next(err); }
}

async function sendNow(req, res, next) {
  try {
    const results = await service.sendDigests({
      force: true,
      subscriptionId: req.body.subscriptionId || null,
      actor: req.user
    });
    const sent = results.filter((r) => r.status === 'sent').length;
    const logged = results.filter((r) => r.status === 'logged_only').length;
    res.redirect(withQuery('settings/digest', {
      flash: `Digest processed for ${results.length} subscription(s): ${sent} emailed, ${logged} logged (no SMTP configured).`
    }));
  } catch (err) { next(err); }
}

module.exports = { page, create, update, remove, sendNow };
