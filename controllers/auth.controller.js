'use strict';
const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const { u } = require('../utils/nav');

async function loginPage(req, res, next) {
  try {
    if (req.user) return res.redirect(u('dashboard'));
    const accounts = await authService.demoAccounts();
    res.render('login', {
      title: 'Sign in',
      layout: false,
      accounts,
      error: req.query.error || null,
      next: req.query.next || ''
    });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.authenticate(email, password);
    if (!result.ok) {
      const message = result.reason === 'suspended'
        ? 'This account is suspended. Contact an administrator.'
        : 'Incorrect email or password.';
      await audit.log({
        actor: { id: null, email: String(email || '').slice(0, 190), role: null },
        action: 'login_failed', entityType: 'session', entityLabel: String(email || ''),
        details: { reason: result.reason }, ip: req.ip
      });
      const accounts = await authService.demoAccounts();
      return res.status(401).render('login', {
        title: 'Sign in', layout: false, accounts, error: message, next: req.body.next || ''
      });
    }
    req.session.user = result.user;
    await audit.log({ actor: result.user, action: 'login', entityType: 'session', entityId: result.user.id, entityLabel: result.user.email, ip: req.ip });
    const target = req.body.next && !/^https?:/i.test(req.body.next) ? req.body.next : null;
    return req.session.save(() => res.redirect(target || u('dashboard')));
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    if (req.user) {
      await audit.log({ actor: req.user, action: 'logout', entityType: 'session', entityId: req.user.id, entityLabel: req.user.email, ip: req.ip });
    }
    req.session.destroy(() => res.redirect(u('login')));
  } catch (err) { next(err); }
}

module.exports = { loginPage, login, logout };
