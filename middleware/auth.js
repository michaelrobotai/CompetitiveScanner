'use strict';
const { u } = require('../utils/nav');
const { httpError } = require('./errors');

// Concept role matrix: viewer = read-only, analyst = manage competitors/sources +
// triage signals, admin = everything incl. users, connectors and settings.
const PERMISSIONS = {
  viewer: [
    'dashboard.view', 'competitors.view', 'signals.view', 'items.view',
    'runs.view', 'reports.view', 'digest.view'
  ],
  analyst: [
    'dashboard.view', 'competitors.view', 'competitors.manage', 'sources.manage',
    'signals.view', 'signals.triage', 'items.view', 'runs.view', 'runs.trigger',
    'reports.view', 'reports.generate', 'digest.view', 'digest.manage', 'notes.create'
  ],
  admin: [
    'dashboard.view', 'competitors.view', 'competitors.manage', 'competitors.delete',
    'sources.manage', 'signals.view', 'signals.triage', 'items.view', 'runs.view',
    'runs.trigger', 'reports.view', 'reports.generate', 'digest.view', 'digest.manage',
    'notes.create', 'users.manage', 'connectors.manage', 'settings.manage', 'audit.view'
  ]
};

function can(user, permission) {
  if (!user) return false;
  const list = PERMISSIONS[user.role] || [];
  return list.includes(permission);
}

function attachUser(req, res, next) {
  const user = (req.session && req.session.user) || null;
  req.user = user;
  res.locals.currentUser = user;
  res.locals.can = (permission) => can(user, permission);
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) {
    return next(httpError(401, 'Authentication required', 'unauthenticated'));
  }
  const target = encodeURIComponent(req.originalUrl || '');
  return res.redirect(u(`login?next=${target}`));
}

function requirePermission(permission) {
  return function permissionGuard(req, res, next) {
    if (!req.user) return requireAuth(req, res, next);
    if (can(req.user, permission)) return next();
    if (req.path.startsWith('/api/')) {
      return next(httpError(403, `Your role (${req.user.role}) is not allowed to perform this action`, 'forbidden'));
    }
    return res.status(403).render('error', {
      title: 'Access denied',
      statusCode: 403,
      message: `Your role (${req.user.role}) does not have permission for this action.`
    });
  };
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return requireAuth(req, res, next);
    if (roles.includes(req.user.role)) return next();
    if (req.path.startsWith('/api/')) {
      return next(httpError(403, 'Insufficient role', 'forbidden'));
    }
    return res.status(403).render('error', {
      title: 'Access denied',
      statusCode: 403,
      message: `This area requires one of these roles: ${roles.join(', ')}.`
    });
  };
}

module.exports = { PERMISSIONS, can, attachUser, requireAuth, requirePermission, requireRole };
