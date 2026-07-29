'use strict';
// URL helper. The app runs behind a path-based proxy at BASE_PATH (/run/<id>).
// NEVER emit a bare leading-slash path to the browser — always run it through u().
const BASE = process.env.BASE_PATH || '';

function u(pathname = '') {
  const clean = String(pathname).replace(/^\/+/, '');
  return `${BASE}/${clean}`;
}

function redirectTo(res, pathname) {
  return res.redirect(u(pathname));
}

function withQuery(pathname, params = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `${u(pathname)}?${qs}` : u(pathname);
}

module.exports = { BASE, u, redirectTo, withQuery };
