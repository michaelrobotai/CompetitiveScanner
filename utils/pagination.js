'use strict';

function parsePaging(query, defaultPerPage = 25) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const allowed = [10, 25, 50, 100];
  let perPage = parseInt(query.perPage, 10) || defaultPerPage;
  if (!allowed.includes(perPage)) perPage = defaultPerPage;
  return { page, perPage, offset: (page - 1) * perPage };
}

function buildPager(total, page, perPage) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, pages);
  const window = [];
  const from = Math.max(1, current - 2);
  const to = Math.min(pages, current + 2);
  for (let i = from; i <= to; i += 1) window.push(i);
  return {
    total,
    page: current,
    perPage,
    pages,
    window,
    hasPrev: current > 1,
    hasNext: current < pages,
    firstRow: total === 0 ? 0 : (current - 1) * perPage + 1,
    lastRow: Math.min(total, current * perPage)
  };
}

function sortClause(requested, allowedMap, fallback) {
  const key = allowedMap[requested] ? requested : fallback;
  return { column: allowedMap[key], key };
}

function queryString(params, overrides = {}) {
  const merged = { ...params, ...overrides };
  return Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

module.exports = { parsePaging, buildPager, sortClause, queryString };
