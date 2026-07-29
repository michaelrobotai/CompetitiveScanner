'use strict';
const service = require('../services/users.service');
const { PERMISSIONS } = require('../middleware/auth');
const { withQuery } = require('../utils/nav');

async function page(req, res, next) {
  try {
    const rows = await service.list();
    res.render('settings/users', {
      title: 'Users & Roles',
      active: 'users',
      rows,
      roles: service.ROLES,
      permissions: PERMISSIONS,
      editId: req.query.edit ? parseInt(req.query.edit, 10) : null,
      flash: req.query.flash || null
    });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    await service.create(req.body, req.user, req.ip);
    res.redirect(withQuery('settings/users', { flash: 'User created.' }));
  } catch (err) {
    if (err.status === 400) return res.redirect(withQuery('settings/users', { flash: err.message }));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    await service.update(req.params.id, req.body, req.user, req.ip);
    res.redirect(withQuery('settings/users', { flash: 'User updated.' }));
  } catch (err) {
    if (err.status === 400) return res.redirect(withQuery('settings/users', { flash: err.message }));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.remove(req.params.id, req.user, req.ip);
    res.redirect(withQuery('settings/users', { flash: 'User deleted.' }));
  } catch (err) {
    if (err.status === 400) return res.redirect(withQuery('settings/users', { flash: err.message }));
    next(err);
  }
}

module.exports = { page, create, update, remove };
