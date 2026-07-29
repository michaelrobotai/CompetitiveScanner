'use strict';
const { defineAdapter, makeItem, STATUS } = require('./base');
const mock = require('../mockData');

// Blog / newsroom / press-release collector. Parses RSS/Atom when the URL is a
// feed, otherwise falls back to scraping headline anchors from the page.
module.exports = defineAdapter({
  key: 'blog_rss',
  name: 'Blog / Newsroom Feed',
  category: 'Owned media',
  authType: 'scrape',
  envKey: null,
  credibility: 88,
  rateLimitPerHour: 120,
  description: 'Reads RSS/Atom feeds or scrapes newsroom pages for blog posts and press releases.',
  isConfigured: () => true,
  async collect(ctx) {
    const { competitor, source, fetchPage, demoMode } = ctx;
    if (!source.url) return { status: STATUS.ERROR, items: [], error: 'No feed URL configured' };

    const result = await fetchPage(source.url, { raw: true });
    if (result.robotsBlocked) return { status: STATUS.ROBOTS_BLOCKED, items: [], error: 'robots.txt disallows this feed' };
    if (result.rateLimited) return { status: STATUS.RATE_LIMITED, items: [], error: `Rate limited (HTTP ${result.statusCode})` };

    if (!result.ok) {
      if (demoMode) {
        const items = mock.generate('blog_rss', competitor, source).map((m) => makeItem({ ...m, credibility: 88, url: source.url }));
        return { status: STATUS.OK, items, note: `Feed unreachable (${result.error || 'network error'}); demo mode generated simulated posts.` };
      }
      return { status: STATUS.ERROR, items: [], error: result.error || `HTTP ${result.statusCode}` };
    }

    const entries = parseFeed(result.body || result.text || '');
    if (!entries.length && demoMode) {
      const items = mock.generate('blog_rss', competitor, source).map((m) => makeItem({ ...m, credibility: 88, url: source.url }));
      return { status: STATUS.OK, items, note: 'No parseable feed entries; demo mode generated simulated posts.' };
    }

    const items = entries.slice(0, 10).map((e) => makeItem({
      title: e.title,
      url: e.link || source.url,
      excerpt: e.description,
      rawContent: e.description,
      publishedAt: e.pubDate || new Date(),
      credibility: 88,
      typeGuess: guess(e.title, e.description)
    }));
    return { status: STATUS.OK, items };
  }
});

function parseFeed(xml) {
  const out = [];
  const itemRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let match = itemRe.exec(xml);
  while (match && out.length < 25) {
    const block = match[0];
    const title = tag(block, 'title');
    if (title) {
      out.push({
        title: decode(title).slice(0, 380),
        link: linkOf(block),
        description: decode(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content') || '').slice(0, 4000),
        pubDate: dateOf(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated'))
      });
    }
    match = itemRe.exec(xml);
  }
  return out;
}

function tag(block, name) {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function linkOf(block) {
  const plain = tag(block, 'link');
  if (plain && !/^\s*$/.test(plain)) return decode(plain);
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return href ? href[1] : null;
}

function dateOf(value) {
  if (!value) return null;
  const d = new Date(decode(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function decode(str) {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function guess(title, body) {
  const t = `${title || ''} ${body || ''}`.toLowerCase();
  if (/introducing|launch|general availability|now available|announcing .*(platform|product)/.test(t)) return 'major_product_release';
  if (/acquire[sd]?|acquisition of/.test(t)) return 'acquiring_company';
  if (/merger|merge with|combining with/.test(t)) return 'merger';
  if (/record (quarter|revenue)|revenue grew|arr (grew|up)/.test(t)) return 'unusual_revenue_gain';
  return 'other_strategic_move';
}
