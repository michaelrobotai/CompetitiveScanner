'use strict';
const website_page = require('./adapters/website_page');
const blog_rss = require('./adapters/blog_rss');
const linkedin_company = require('./adapters/linkedin_company');
const linkedin_executive = require('./adapters/linkedin_executive');
const news_search = require('./adapters/news_search');
const job_board = require('./adapters/job_board');
const funding_db = require('./adapters/funding_db');
const sec_filing = require('./adapters/sec_filing');
const review_site = require('./adapters/review_site');
const social = require('./adapters/social');

const ADAPTERS = [
  website_page,
  blog_rss,
  linkedin_company,
  linkedin_executive,
  news_search,
  job_board,
  funding_db,
  sec_filing,
  review_site,
  social
];

const BY_KEY = ADAPTERS.reduce((acc, a) => { acc[a.key] = a; return acc; }, {});

function get(key) {
  return BY_KEY[key] || null;
}

function list() {
  return ADAPTERS.slice();
}

module.exports = { ADAPTERS, get, list };
