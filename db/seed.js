'use strict';
/**
 * Competitive Radar — demo data seeder.
 * Idempotent: safe to run repeatedly (uses INSERT ... ON DUPLICATE KEY UPDATE
 * or existence checks). Run with:  node db/seed.js
 */
const db = require('../config/db');
const { hashPassword, sha256 } = require('../utils/hash');
const sourcesSvc = require('../services/sources.service');

const DEMO_PASSWORD = 'demo1234';

const USERS = [
  { full_name: 'Dana Reeves', email: 'admin@radar.demo', role: 'admin', job_title: 'Head of Strategy' },
  { full_name: 'Marcus Liang', email: 'analyst@radar.demo', role: 'analyst', job_title: 'Competitive Intelligence Analyst' },
  { full_name: 'Priya Shah', email: 'viewer@radar.demo', role: 'viewer', job_title: 'Product Marketing Manager' }
];

const COMPETITORS = [
  {
    name: 'Northwind Analytics', slug: 'northwind-analytics', website: 'https://www.northwind-analytics.com',
    linkedin_url: 'https://www.linkedin.com/company/northwind-analytics', ticker: 'NWND',
    industry: 'Analytics software', hq_country: 'United States', size_band: '1001-5000',
    priority: 'high', tracking_status: 'active', tags: 'direct-competitor, enterprise, public',
    description: 'Publicly traded enterprise analytics platform. Our closest head-to-head competitor in the enterprise segment.',
    profile: {
      positioning: 'The "single source of truth" enterprise analytics suite for regulated industries.',
      target_segments: 'Financial services, healthcare, public sector — 1,000+ seats',
      pricing_model: 'Annual platform fee plus per-seat tiers; heavy discounting on multi-year deals.',
      key_products: 'Northwind Core, Northwind Governance, Northwind Embedded',
      strengths: 'Deep compliance/governance features, entrenched CIO relationships, large services arm.',
      weaknesses: 'Slow release cadence, poor self-serve motion, rising customer complaints about pricing.',
      recent_moves: 'Hired a VP Corporate Development; filed an 8-K referencing a material agreement.',
      threat_level: 'critical'
    }
  },
  {
    name: 'Vertex Cloud Systems', slug: 'vertex-cloud-systems', website: 'https://www.vertexcloud.io',
    linkedin_url: 'https://www.linkedin.com/company/vertex-cloud-systems', ticker: null,
    industry: 'Cloud infrastructure', hq_country: 'Ireland', size_band: '201-1000',
    priority: 'high', tracking_status: 'active', tags: 'direct-competitor, emea, private',
    description: 'Fast-growing EMEA cloud data platform, aggressive in mid-market deals and frequently undercuts us on price.',
    profile: {
      positioning: 'Developer-first cloud data platform with usage-based pricing.',
      target_segments: 'Mid-market SaaS and fintech across EMEA',
      pricing_model: 'Pure usage-based with generous free tier.',
      key_products: 'Vertex Streams, Vertex Warehouse, Vertex Sync',
      strengths: 'Strong developer brand, rapid shipping, excellent docs.',
      weaknesses: 'Thin enterprise governance story, small services capacity.',
      recent_moves: 'Closed a $120M Series D; expanded into North America.',
      threat_level: 'high'
    }
  },
  {
    name: 'Helios Data Group', slug: 'helios-data-group', website: 'https://www.heliosdata.com',
    linkedin_url: 'https://www.linkedin.com/company/helios-data-group', ticker: 'HLDG',
    industry: 'Data management', hq_country: 'United States', size_band: '5000+',
    priority: 'medium', tracking_status: 'active', tags: 'adjacent, public, acquisitive',
    description: 'Large public data-management incumbent that grows mainly through acquisition. A likely acquirer of smaller rivals.',
    profile: {
      positioning: 'The consolidated data-management stack for the Fortune 500.',
      target_segments: 'Fortune 500 across all verticals',
      pricing_model: 'Enterprise license agreements, multi-product bundling.',
      key_products: 'Helios MDM, Helios Catalog, Helios Quality',
      strengths: 'Balance sheet, channel reach, procurement relationships.',
      weaknesses: 'Fragmented product portfolio from repeated M&A; dated UX.',
      recent_moves: 'Acquired an analytics startup; opened 14 corp-dev and integration roles.',
      threat_level: 'high'
    }
  },
  {
    name: 'Lumina Insights', slug: 'lumina-insights', website: 'https://www.luminainsights.com',
    linkedin_url: 'https://www.linkedin.com/company/lumina-insights', ticker: null,
    industry: 'Business intelligence', hq_country: 'Canada', size_band: '51-200',
    priority: 'medium', tracking_status: 'active', tags: 'challenger, private, plg',
    description: 'Product-led BI challenger with strong bottom-up adoption. Rumoured to be exploring a sale.',
    profile: {
      positioning: 'Beautiful, fast BI that anyone in the company can use.',
      target_segments: 'SMB and mid-market, bottom-up adoption',
      pricing_model: 'Self-serve seat pricing with a free tier.',
      key_products: 'Lumina Boards, Lumina Metrics',
      strengths: 'Design, time-to-value, viral adoption.',
      weaknesses: 'Limited scale, no enterprise compliance story, high churn risk.',
      recent_moves: 'CEO publicly referenced "evaluating strategic alternatives".',
      threat_level: 'medium'
    }
  },
  {
    name: 'Quanta Metrics', slug: 'quanta-metrics', website: 'https://www.quantametrics.dev',
    linkedin_url: 'https://www.linkedin.com/company/quanta-metrics', ticker: null,
    industry: 'Observability', hq_country: 'Germany', size_band: '51-200',
    priority: 'low', tracking_status: 'active', tags: 'adjacent, emea, private',
    description: 'Observability startup drifting into our analytics territory with an embedded metrics product.',
    profile: {
      positioning: 'Metrics and observability for engineering-led organisations.',
      target_segments: 'Engineering teams at high-growth startups',
      pricing_model: 'Usage-based on ingested events.',
      key_products: 'Quanta Pulse, Quanta Trace',
      strengths: 'Engineering credibility, efficient infrastructure.',
      weaknesses: 'Narrow buyer persona, minimal business-user features.',
      recent_moves: 'Published an engineering post about a 34% infrastructure cost reduction.',
      threat_level: 'low'
    }
  },
  {
    name: 'Apex Reporting Co', slug: 'apex-reporting-co', website: 'https://www.apexreporting.com',
    linkedin_url: 'https://www.linkedin.com/company/apex-reporting', ticker: 'APXR',
    industry: 'Reporting software', hq_country: 'United Kingdom', size_band: '201-1000',
    priority: 'medium', tracking_status: 'active', tags: 'legacy, public, declining',
    description: 'Legacy reporting vendor losing ground. Watch for distress signals and a possible take-private.',
    profile: {
      positioning: 'Reliable regulatory and financial reporting for established enterprises.',
      target_segments: 'Finance teams in UK/EU enterprises',
      pricing_model: 'Perpetual licence plus maintenance, migrating to subscription.',
      key_products: 'Apex Reports, Apex Close',
      strengths: 'Sticky finance workflows, regulatory templates.',
      weaknesses: 'Declining revenue, ageing platform, hiring freeze.',
      recent_moves: '10-Q showed revenue down 19% with a goodwill impairment; job postings dropped sharply.',
      threat_level: 'medium'
    }
  },
  {
    name: 'Solstice AI', slug: 'solstice-ai', website: 'https://www.solstice.ai',
    linkedin_url: 'https://www.linkedin.com/company/solstice-ai', ticker: null,
    industry: 'AI platform', hq_country: 'United States', size_band: '1-50',
    priority: 'high', tracking_status: 'active', tags: 'emerging, ai, private',
    description: 'Well-funded AI-native entrant. Small today, but shipping fast and winning greenfield AI budgets.',
    profile: {
      positioning: 'AI-native analytics — ask questions, get agentic workflows.',
      target_segments: 'Innovation budgets across mid-market and enterprise',
      pricing_model: 'Consumption-based on agent runs.',
      key_products: 'Solstice Atlas, Solstice Agents',
      strengths: 'Speed of shipping, AI-native architecture, hype cycle tailwind.',
      weaknesses: 'Unproven at scale, tiny support organisation.',
      recent_moves: 'Launched Atlas, its biggest release, with agentic automation.',
      threat_level: 'high'
    }
  },
  {
    name: 'Cobalt Grid', slug: 'cobalt-grid', website: 'https://www.cobaltgrid.com',
    linkedin_url: 'https://www.linkedin.com/company/cobalt-grid', ticker: null,
    industry: 'Data integration', hq_country: 'Australia', size_band: '51-200',
    priority: 'low', tracking_status: 'paused', tags: 'apac, private, watchlist',
    description: 'APAC data-integration vendor. Currently paused — kept on the watchlist for re-activation.',
    profile: {
      positioning: 'Regional data integration specialist for APAC compliance regimes.',
      target_segments: 'ANZ enterprises and government',
      pricing_model: 'Annual subscription by connector count.',
      key_products: 'Cobalt Pipelines',
      strengths: 'Local presence and compliance knowledge.',
      weaknesses: 'Limited outside APAC; small R&D team.',
      recent_moves: 'No material moves detected in the last quarter.',
      threat_level: 'low'
    }
  }
];

// Raw collected items per competitor slug — spread across all connectors.
function itemsFor(slug, name) {
  const base = {
    'northwind-analytics': [
      { connector: 'sec_filing', target: 'filings', title: `${name} files 8-K disclosing merger agreement`, cred: 98, guess: 'merger',
        excerpt: 'Form 8-K, Item 1.01: entry into a material definitive agreement — merger with a wholly owned subsidiary of the acquirer.',
        raw: `On the date hereof, ${name} entered into an Agreement and Plan of Merger providing for the merger of a wholly owned subsidiary of Parent with and into the Company.` },
      { connector: 'news_search', target: 'news', title: `Report: ${name} nears all-stock merger with a larger platform vendor`, cred: 82, guess: 'merger',
        excerpt: 'Three people familiar with the negotiations describe a definitive agreement being finalised.',
        raw: `${name} is finalising a definitive agreement and plan of merger, according to people familiar with the matter. A deal could be announced within weeks.` },
      { connector: 'linkedin_company', target: 'company', title: `${name} posted: "A new chapter for our company"`, cred: 75, guess: 'merger',
        excerpt: 'Company page hints at a significant corporate milestone and thanks employees "as we prepare for the next chapter".',
        raw: `A new chapter for ${name}. Today we signed a definitive agreement that will see us join forces with a global platform leader.` },
      { connector: 'job_board', target: 'jobs', title: `${name} opened a VP Corporate Development role`, cred: 68, guess: 'acquiring_company',
        excerpt: 'Corp-dev, M&A integration and transactional counsel roles posted the same week.',
        raw: `New postings: VP Corporate Development, Manager M&A Integration, Senior Counsel (Transactions).` },
      { connector: 'website_page', target: 'pricing', title: `${name} pricing page changed`, cred: 85, guess: 'other_strategic_move',
        excerpt: 'Enterprise tier now lists usage-based billing and dedicated onboarding.',
        raw: 'Enterprise tier now lists "usage-based billing" and "dedicated onboarding". Previous copy referenced flat annual pricing only.',
        change: 'changed', diff: '+ Enterprise: usage-based billing\n+ Enterprise: dedicated onboarding\n- Flat annual pricing only' },
      { connector: 'review_site', target: 'reviews', title: `${name} G2 rating slipped from 4.5 to 4.1`, cred: 65, guess: 'unusual_revenue_loss',
        excerpt: '128 new reviews with recurring complaints about an unexpected price increase and slow support.',
        raw: 'Aggregate rating declined to 4.1 across 128 new reviews. Top negative themes: unexpected price increase (41), slow support (33).' }
    ],
    'vertex-cloud-systems': [
      { connector: 'funding_db', target: 'funding', title: `${name} raises $120M Series D led by Meridian Growth`, cred: 90, guess: 'unusual_revenue_gain',
        excerpt: 'New late-stage round at a reported $1.1B post-money valuation.',
        raw: 'Round: Series D. Amount: $120,000,000. Lead: Meridian Growth Partners. Post-money valuation: $1.1B. Use of funds: international expansion and M&A.' },
      { connector: 'news_search', target: 'news', title: `${name} triples ARR and opens a North American HQ`, cred: 82, guess: 'unusual_revenue_gain',
        excerpt: 'Coverage cites revenue grew 210% year over year with net revenue retention of 131%.',
        raw: 'Revenue grew 210% year over year; net revenue retention at 131%. The company is opening a North American headquarters.' },
      { connector: 'linkedin_executive', target: 'executives', title: `${name} CRO: "record quarter, 3x pipeline"`, cred: 70, guess: 'unusual_revenue_gain',
        excerpt: 'Revenue leader publicly celebrating an outsized quarter.',
        raw: 'Closed our largest quarter ever — 118% of plan, and pipeline up 3x year over year.' },
      { connector: 'blog_rss', target: 'blog', title: `${name} launches Vertex Sync for real-time replication`, cred: 88, guess: 'major_product_release',
        excerpt: 'General availability of a new real-time replication product.',
        raw: 'Vertex Sync is now generally available, bringing real-time replication to every Vertex customer.' },
      { connector: 'website_page', target: 'careers', title: `${name} careers page changed`, cred: 85, guess: 'other_strategic_move',
        excerpt: '22 new roles added, concentrated in North American sales.',
        raw: 'Open roles increased from 31 to 53, with 14 new North American sales positions.',
        change: 'changed', diff: '+ Account Executive, New York\n+ Account Executive, Austin\n+ Sales Engineer, Toronto' }
    ],
    'helios-data-group': [
      { connector: 'news_search', target: 'news', title: `${name} acquires analytics startup Lumen Metrics`, cred: 82, guess: 'acquiring_company',
        excerpt: 'Acquisition announced to accelerate the embedded analytics roadmap. Terms undisclosed.',
        raw: `${name} today announced the acquisition of Lumen Metrics, a 40-person analytics startup.` },
      { connector: 'sec_filing', target: 'filings', title: `${name} 8-K reports completion of an acquisition`, cred: 98, guess: 'acquiring_company',
        excerpt: 'Item 2.01: completion of acquisition of assets.',
        raw: 'Item 2.01 Completion of Acquisition or Disposition of Assets. The Company completed the acquisition of substantially all assets of the target.' },
      { connector: 'job_board', target: 'jobs', title: `${name} posts 14 corp-dev and integration roles`, cred: 68, guess: 'acquiring_company',
        excerpt: 'Hiring pattern strongly indicates an active acquisition programme.',
        raw: 'New postings: Director M&A Integration, Post-Merger IT Lead, Corp Dev Analyst, Integration PMO Manager.' },
      { connector: 'blog_rss', target: 'newsroom', title: `${name} newsroom: "Welcoming Lumen Metrics to Helios"`, cred: 88, guess: 'acquiring_company',
        excerpt: 'Official welcome post confirming the team joins the data platform group.',
        raw: 'We are thrilled to welcome the Lumen Metrics team to Helios. They will join our data platform group.' },
      { connector: 'social', target: 'social', title: `Chatter spike about ${name} acquisitions`, cred: 45, guess: 'acquiring_company',
        excerpt: 'Mention volume up 3.1x, mostly discussing consolidation in the data-management market.',
        raw: 'r/dataengineering thread on Helios buying up the market reached 800 upvotes.' }
    ],
    'lumina-insights': [
      { connector: 'linkedin_executive', target: 'executives', title: `${name} CEO posts about "strategic alternatives"`, cred: 70, guess: 'acquisition_target',
        excerpt: 'Executive post referencing advisors, a board process and evaluating strategic alternatives.',
        raw: `Our board has retained advisors to evaluate strategic alternatives for ${name}, including partnership and sale scenarios.` },
      { connector: 'news_search', target: 'news', title: `Report: ${name} in advanced talks to be acquired`, cred: 82, guess: 'acquisition_target',
        excerpt: 'Sources describe late-stage discussions with a strategic buyer near a $1.4B valuation.',
        raw: `${name} is in advanced talks to be acquired by a larger platform vendor, according to three people familiar with the negotiations.` },
      { connector: 'social', target: 'social', title: `Reddit thread: "Is ${name} getting bought?"`, cred: 45, guess: 'acquisition_target',
        excerpt: 'Employees changing bios and recruiters referencing a quiet period.',
        raw: `r/SaaS thread "Is ${name} getting bought?" reached 1.2k upvotes. Mention volume rose 4.6x.` },
      { connector: 'job_board', target: 'jobs', title: `${name} froze most open roles`, cred: 68, guess: 'unusual_revenue_loss',
        excerpt: 'Open roles fell from 24 to 6 in three weeks — consistent with a deal process.',
        raw: 'Open roles at the company fell from 24 to 6 in three weeks, with all sales roles removed.' }
    ],
    'quanta-metrics': [
      { connector: 'blog_rss', target: 'blog', title: `${name} engineering: scaling to 40 billion events a day`, cred: 88, guess: 'other_strategic_move',
        excerpt: 'Infrastructure re-architecture cut spend 34% while tripling throughput.',
        raw: 'Our platform team rebuilt the ingestion tier, cutting infrastructure spend 34% while tripling throughput.' },
      { connector: 'website_page', target: 'product', title: `${name} product page changed`, cred: 85, guess: 'other_strategic_move',
        excerpt: 'New "business metrics" section appeared — a move toward our territory.',
        raw: 'Product page now includes a "business metrics" section aimed at non-engineering users.',
        change: 'changed', diff: '+ Business metrics for non-engineers\n+ Scheduled reporting' },
      { connector: 'social', target: 'social', title: `${name} mentions steady on X`, cred: 45, guess: 'other_strategic_move',
        excerpt: 'No material change in chatter volume.',
        raw: 'Mention volume flat week over week; sentiment neutral-positive.' }
    ],
    'apex-reporting-co': [
      { connector: 'sec_filing', target: 'filings', title: `${name} 10-Q: revenue down 19% year over year`, cred: 98, guess: 'unusual_revenue_loss',
        excerpt: 'Quarterly filing shows a material revenue decline and a goodwill impairment charge.',
        raw: 'Total revenue for the quarter was $61.2M, a decrease of 19% compared to the prior-year period. The Company recorded a goodwill impairment charge of $22.4M.' },
      { connector: 'news_search', target: 'news', title: `${name} warns on guidance, shares fall 22%`, cred: 82, guess: 'unusual_revenue_loss',
        excerpt: 'Company missed guidance and withdrew its full-year outlook.',
        raw: 'The company missed guidance and withdrew its full-year outlook; shares fell 22% on the news.' },
      { connector: 'job_board', target: 'jobs', title: `${name} job postings dropped 62% month over month`, cred: 68, guess: 'unusual_revenue_loss',
        excerpt: 'Sharp contraction across sales and marketing functions.',
        raw: 'Open roles fell from 78 to 30 in four weeks, with the largest reductions in Sales (-24) and Marketing (-11).' },
      { connector: 'review_site', target: 'reviews', title: `${name} review volume spikes with churn language`, cred: 65, guess: 'unusual_revenue_loss',
        excerpt: 'Reviewers repeatedly mention migrating away and churn.',
        raw: '61 new reviews; recurring themes: migrating away (28 mentions), churn (19), price increase (16).' },
      { connector: 'website_page', target: 'pricing', title: `${name} pricing page changed`, cred: 85, guess: 'other_strategic_move',
        excerpt: 'Perpetual licence option removed; subscription-only pricing introduced.',
        raw: 'Perpetual licence option removed from the pricing page. Subscription-only tiers introduced.',
        change: 'changed', diff: '- Perpetual licence\n+ Subscription (annual)\n+ Subscription (3-year)' }
    ],
    'solstice-ai': [
      { connector: 'blog_rss', target: 'blog', title: `Introducing ${name} Atlas — our new AI workflow engine`, cred: 88, guess: 'major_product_release',
        excerpt: 'General availability of Atlas, adding agentic automation, a redesigned builder and native analytics.',
        raw: `Today we are excited to launch ${name} Atlas, the biggest product release in our history. Atlas becomes generally available for all Enterprise customers.` },
      { connector: 'news_search', target: 'news', title: `${name} launches Atlas, its biggest release yet`, cred: 82, guess: 'major_product_release',
        excerpt: 'Press coverage frames Atlas as a major product release for the AI-native analytics category.',
        raw: 'The company launched Atlas, described as a major release introducing agentic automation across the platform.' },
      { connector: 'linkedin_company', target: 'company', title: `${name} posted: "Atlas is now generally available"`, cred: 75, guess: 'major_product_release',
        excerpt: 'Company page announcing general availability with a launch video.',
        raw: 'Atlas is now generally available. Our biggest launch yet — agentic workflows for every team.' },
      { connector: 'funding_db', target: 'funding', title: `${name} extends Series B by $45M`, cred: 90, guess: 'unusual_revenue_gain',
        excerpt: 'Funding database records a Series B extension.',
        raw: 'Round: Series B extension. Amount: $45,000,000. Use of funds: go-to-market expansion.' },
      { connector: 'website_page', target: 'product', title: `${name} product page changed`, cred: 85, guess: 'major_product_release',
        excerpt: 'Atlas added as the headline product with agentic workflow messaging.',
        raw: 'Product page now leads with Atlas and agentic workflows; previous copy led with dashboards.',
        change: 'changed', diff: '+ Atlas: agentic workflows\n- Dashboards first messaging' }
    ],
    'cobalt-grid': [
      { connector: 'website_page', target: 'pricing', title: `${name} pricing page unchanged`, cred: 85, guess: 'other_strategic_move',
        excerpt: 'No content change detected on the pricing page.',
        raw: 'Pricing page content hash identical to the previous capture.', change: 'unchanged' },
      { connector: 'blog_rss', target: 'blog', title: `${name} publishes an ANZ compliance guide`, cred: 88, guess: 'other_strategic_move',
        excerpt: 'Content marketing piece on APAC data-residency rules.',
        raw: 'A practical guide to ANZ data residency requirements for regulated industries.' }
    ]
  };
  return base[slug] || [];
}

function daysAgo(n, hour) {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  if (hour !== undefined) d.setHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return d;
}

async function seedUsers() {
  const hash = await hashPassword(DEMO_PASSWORD);
  for (const usr of USERS) {
    await db.exec(
      `INSERT INTO users (full_name, email, password_hash, role, status, job_title, last_login_at)
       VALUES (?,?,?,?,'active',?,NULL)
       ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password_hash=VALUES(password_hash),
         role=VALUES(role), status='active', job_title=VALUES(job_title)`,
      [usr.full_name, usr.email, hash, usr.role, usr.job_title]
    );
  }
  const admin = await db.one("SELECT id FROM users WHERE email='admin@radar.demo'");
  const analyst = await db.one("SELECT id FROM users WHERE email='analyst@radar.demo'");
  const viewer = await db.one("SELECT id FROM users WHERE email='viewer@radar.demo'");
  console.log(`  users: ${USERS.length} demo accounts ready`);
  return { admin: admin.id, analyst: analyst.id, viewer: viewer.id };
}

async function seedCompetitors(userIds) {
  const map = {};
  for (const c of COMPETITORS) {
    const existing = await db.one('SELECT id FROM competitors WHERE slug = ?', [c.slug]);
    if (existing) {
      map[c.slug] = existing.id;
      continue;
    }
    const result = await db.exec(
      `INSERT INTO competitors (name, slug, website, linkedin_url, ticker, industry, hq_country,
        size_band, priority, tracking_status, description, tags, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [c.name, c.slug, c.website, c.linkedin_url, c.ticker, c.industry, c.hq_country,
        c.size_band, c.priority, c.tracking_status, c.description, c.tags, userIds.admin, daysAgo(60)]
    );
    map[c.slug] = result.insertId;

    await require('../services/competitors.service').createDefaultSources(result.insertId, c);

    await db.exec(
      `INSERT INTO strategy_profiles (competitor_id, positioning, target_segments, pricing_model,
         key_products, strengths, weaknesses, recent_moves, threat_level, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [result.insertId, c.profile.positioning, c.profile.target_segments, c.profile.pricing_model,
        c.profile.key_products, c.profile.strengths, c.profile.weaknesses, c.profile.recent_moves,
        c.profile.threat_level, userIds.analyst]
    );

    await db.exec(
      'INSERT INTO audit_logs (user_id, actor_email, actor_role, action, entity_type, entity_id, entity_label, details_json, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [userIds.admin, 'admin@radar.demo', 'admin', 'create', 'competitor', String(result.insertId), c.name,
        JSON.stringify({ priority: c.priority, tracking_status: c.tracking_status }), '10.0.0.11', daysAgo(60)]
    );
  }
  console.log(`  competitors: ${Object.keys(map).length} tracked`);
  return map;
}

async function seedRuns(userIds, competitorMap) {
  const existing = await db.one('SELECT COUNT(*) AS n FROM scan_runs');
  if (Number(existing.n) > 0) {
    const rows = await db.query('SELECT id FROM scan_runs ORDER BY id');
    console.log(`  scan runs: ${rows.length} already present, reusing`);
    return rows.map((r) => r.id);
  }
  const runs = [
    { type: 'scheduled', days: 6, status: 'completed', by: null, dur: 41250 },
    { type: 'scheduled', days: 4, status: 'partial', by: null, dur: 38900 },
    { type: 'manual_all', days: 2, status: 'completed', by: userIds.analyst, dur: 35400 },
    { type: 'scheduled', days: 1, status: 'completed', by: null, dur: 44100 }
  ];
  const ids = [];
  for (const r of runs) {
    const started = daysAgo(r.days, 6);
    const finished = new Date(started.getTime() + r.dur);
    const result = await db.exec(
      `INSERT INTO scan_runs (run_type, status, competitor_id, triggered_by, started_at, finished_at,
        duration_ms, competitors_scanned, sources_total, sources_ok, sources_failed,
        sources_not_configured, sources_skipped, items_collected, signals_created, signals_merged,
        error_summary, results_json, created_at)
       VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        r.type, r.status, r.by, started, finished, r.dur,
        7, 84, r.status === 'partial' ? 68 : 76, r.status === 'partial' ? 6 : 0, 8, 2,
        0, 0, 0,
        r.status === 'partial' ? 'Northwind Analytics / Product page: Timeout after 8000ms\nApex Reporting Co / Blog feed: HTTP 503' : null,
        JSON.stringify([]), started
      ]
    );
    ids.push(result.insertId);
  }
  console.log(`  scan runs: ${ids.length} historical runs`);
  return ids;
}

async function seedItems(competitorMap, runIds) {
  const existing = await db.one('SELECT COUNT(*) AS n FROM collected_items');
  if (Number(existing.n) > 0) {
    console.log(`  collected items: ${existing.n} already present, skipping`);
    return;
  }
  let total = 0;
  let idx = 0;
  for (const c of COMPETITORS) {
    const competitorId = competitorMap[c.slug];
    const sources = await db.query('SELECT * FROM competitor_sources WHERE competitor_id = ?', [competitorId]);
    const byConnector = {};
    sources.forEach((s) => { if (!byConnector[s.connector_key]) byConnector[s.connector_key] = s; });

    for (const item of itemsFor(c.slug, c.name)) {
      const source = byConnector[item.connector] || null;
      const runId = runIds[idx % runIds.length];
      const published = daysAgo((idx % 5) + 1, 9 + (idx % 8));
      const hash = sha256(`${item.title}|${item.connector}|${competitorId}`);
      try {
        await db.exec(
          `INSERT INTO collected_items
            (competitor_id, source_id, scan_run_id, connector_key, source_type, title, url, author,
             excerpt, raw_content, content_hash, change_type, diff_summary, credibility,
             published_at, captured_at, processing_status, signal_type_guess, is_mock, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,1,?)`,
          [
            competitorId, source ? source.id : null, runId, item.connector, item.target,
            item.title, source && source.url ? source.url : c.website, item.author || null,
            item.excerpt, item.raw, hash, item.change || 'new', item.diff || null, item.cred,
            published, published, item.guess, published
          ]
        );
        total += 1;
      } catch (err) {
        if (!/Duplicate entry/.test(err.message)) throw err;
      }
      idx += 1;
    }
  }
  console.log(`  collected items: ${total} inserted`);
}

async function seedDigests(userIds, competitorMap) {
  const existing = await db.one('SELECT COUNT(*) AS n FROM digest_subscriptions');
  if (Number(existing.n) > 0) {
    console.log(`  digest subscriptions: ${existing.n} already present, skipping`);
    return;
  }
  const allCats = ['acquisition_target', 'merger', 'acquiring_company', 'major_product_release',
    'unusual_revenue_gain', 'unusual_revenue_loss', 'other_strategic_move'];

  await db.exec(
    `INSERT INTO digest_subscriptions (user_id, recipient_name, recipient_email, frequency, send_time,
      timezone, min_confidence, categories_json, competitors_json, include_raw_items, instant_alerts, enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userIds.admin, 'Dana Reeves', 'admin@radar.demo', 'daily', '07:15', 'UTC', 50,
      JSON.stringify(allCats), JSON.stringify([]), 0, 1, 1]
  );
  await db.exec(
    `INSERT INTO digest_subscriptions (user_id, recipient_name, recipient_email, frequency, send_time,
      timezone, min_confidence, categories_json, competitors_json, include_raw_items, instant_alerts, enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userIds.analyst, 'Marcus Liang', 'analyst@radar.demo', 'daily', '06:45', 'UTC', 40,
      JSON.stringify(allCats), JSON.stringify([]), 1, 1, 1]
  );
  await db.exec(
    `INSERT INTO digest_subscriptions (user_id, recipient_name, recipient_email, frequency, send_time,
      timezone, min_confidence, categories_json, competitors_json, include_raw_items, instant_alerts, enabled)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userIds.viewer, 'Priya Shah', 'viewer@radar.demo', 'weekly', '08:30', 'UTC', 65,
      JSON.stringify(['merger', 'acquisition_target', 'major_product_release']),
      JSON.stringify([competitorMap['northwind-analytics'], competitorMap['solstice-ai']].filter(Boolean)), 0, 0, 1]
  );
  console.log('  digest subscriptions: 3 created');
}

async function seedNotes(userIds, competitorMap) {
  const existing = await db.one('SELECT COUNT(*) AS n FROM notes');
  if (Number(existing.n) > 0) return;
  const notes = [
    { slug: 'northwind-analytics', by: userIds.analyst, body: 'Merger chatter is now corroborated by the 8-K. Escalated to the strategy review; sales needs battlecard updates before the deal closes.' },
    { slug: 'lumina-insights', by: userIds.analyst, body: 'CEO language plus the hiring freeze reads like a live sale process. Worth watching who the buyer is — could reshape the mid-market.' },
    { slug: 'apex-reporting-co', by: userIds.admin, body: 'Revenue deterioration confirmed by the 10-Q. Good displacement target for our finance-reporting motion.' },
    { slug: 'solstice-ai', by: userIds.analyst, body: 'Atlas launch is the real threat here — agentic workflows land directly on our roadmap. Requesting a product teardown.' }
  ];
  for (const n of notes) {
    if (!competitorMap[n.slug]) continue;
    await db.exec('INSERT INTO notes (competitor_id, author_id, body, created_at) VALUES (?,?,?,?)',
      [competitorMap[n.slug], n.by, n.body, daysAgo(2, 14)]);
  }
  console.log(`  notes: ${notes.length} analyst notes`);
}

async function seedAuditExtras(userIds) {
  const existing = await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action='login'");
  if (Number(existing.n) > 0) return;
  const entries = [
    [userIds.admin, 'admin@radar.demo', 'admin', 'login', 'session', String(userIds.admin), 'admin@radar.demo', '{}', '10.0.0.11', daysAgo(3, 8)],
    [userIds.analyst, 'analyst@radar.demo', 'analyst', 'login', 'session', String(userIds.analyst), 'analyst@radar.demo', '{}', '10.0.0.24', daysAgo(2, 9)],
    [userIds.viewer, 'viewer@radar.demo', 'viewer', 'login', 'session', String(userIds.viewer), 'viewer@radar.demo', '{}', '10.0.0.37', daysAgo(1, 10)],
    [userIds.admin, 'admin@radar.demo', 'admin', 'update', 'connector', 'news_search', 'News & Tech Press Mentions', JSON.stringify({ credibility: 82 }), '10.0.0.11', daysAgo(5, 11)],
    [userIds.analyst, 'analyst@radar.demo', 'analyst', 'trigger_scan', 'scan_run', '3', 'Manual run (manual_all)', JSON.stringify({ runType: 'manual_all' }), '10.0.0.24', daysAgo(2, 6)]
  ];
  for (const e of entries) {
    await db.exec(
      'INSERT INTO audit_logs (user_id, actor_email, actor_role, action, entity_type, entity_id, entity_label, details_json, ip_address, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      e
    );
  }
  console.log(`  audit log: ${entries.length} historical entries`);
}

async function seedSettings(userIds) {
  const settings = [
    ['signal_min_confidence', '45', 'signals', 'Minimum confidence to create a signal', 'Item groups scoring below this are retained as raw items only.'],
    ['alert_min_impact', '80', 'signals', 'Instant alert impact threshold', 'Signals at or above this impact (and the confidence threshold) trigger an instant alert.'],
    ['alert_min_confidence', '70', 'signals', 'Instant alert confidence threshold', 'Combined with impact to decide escalation.'],
    ['dedupe_window_hours', '72', 'signals', 'Near-duplicate merge window (hours)', 'Signals of the same category for the same competitor merge inside this window.'],
    ['demo_mode', 'true', 'general', 'Demo mode', 'Unconfigured adapters emit realistic simulated items so the pipeline is demonstrable.']
  ];
  for (const s of settings) {
    await db.exec(
      `INSERT INTO app_settings (setting_key, setting_value, category, label, description, updated_by)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), label=VALUES(label), description=VALUES(description)`,
      [s[0], s[1], s[2], s[3], s[4], userIds.admin]
    );
  }
  console.log(`  app settings: ${settings.length} config rows`);
}

async function run() {
  console.log('Seeding Competitive Radar demo data…');
  const userIds = await seedUsers();
  await sourcesSvc.syncConnectors();
  console.log('  connectors: registry synced');
  const competitorMap = await seedCompetitors(userIds);
  const runIds = await seedRuns(userIds, competitorMap);
  await seedItems(competitorMap, runIds);
  await seedDigests(userIds, competitorMap);
  await seedNotes(userIds, competitorMap);
  await seedAuditExtras(userIds);
  await seedSettings(userIds);

  // Run the real analysis engine over the seeded raw items so signals,
  // evidence links, confidence scores and merges are all genuinely produced
  // by the production code path rather than hand-written.
  const analysis = require('../services/analysis.service');
  const result = await analysis.analysePendingItems({ scanRunId: runIds[runIds.length - 1] });
  console.log(`  analysis: ${result.created.length} signals created, ${result.merged.length} merged groups`);

  // Reflect real counts back onto the historical runs.
  const counts = await db.one('SELECT COUNT(*) AS items FROM collected_items');
  const sigCount = await db.one('SELECT COUNT(*) AS n FROM signals');
  const perRun = await db.query('SELECT scan_run_id, COUNT(*) AS n FROM collected_items WHERE scan_run_id IS NOT NULL GROUP BY scan_run_id');
  for (const r of perRun) {
    await db.exec('UPDATE scan_runs SET items_collected = ? WHERE id = ?', [Number(r.n), r.scan_run_id]);
  }
  const lastRun = runIds[runIds.length - 1];
  await db.exec('UPDATE scan_runs SET signals_created = ? WHERE id = ?', [result.created.length, lastRun]);

  // Give a few signals a triage history so the review workflow is visible.
  const toReview = await db.query("SELECT id FROM signals WHERE status='new' ORDER BY confidence DESC LIMIT 5");
  if (toReview.length >= 3) {
    await db.exec("UPDATE signals SET status='confirmed', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?",
      [userIds.analyst, daysAgo(1, 11), 'Confirmed against the 8-K filing — escalated to the strategy review.', toReview[0].id]);
    await db.exec("UPDATE signals SET status='reviewed', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?",
      [userIds.analyst, daysAgo(1, 12), 'Credible but early. Monitoring for a second corroborating source.', toReview[1].id]);
    await db.exec("UPDATE signals SET status='dismissed', reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?",
      [userIds.admin, daysAgo(2, 15), 'Routine content-marketing change, not a strategic move. Retained for audit.', toReview[toReview.length - 1].id]);
  }

  const finalSignals = await db.query(
    `SELECT s.signal_type, COUNT(*) AS n FROM signals s GROUP BY s.signal_type ORDER BY n DESC`
  );
  console.log(`\nSeed complete: ${counts.items} raw items, ${sigCount.n} signals`);
  finalSignals.forEach((r) => console.log(`  - ${r.signal_type}: ${r.n}`));
  console.log('\nDemo accounts (password: demo1234)');
  USERS.forEach((usr) => console.log(`  ${usr.role.padEnd(8)} ${usr.email}`));
}

async function needsSeeding() {
  const row = await db.one('SELECT COUNT(*) AS n FROM users');
  return Number(row.n) === 0;
}

module.exports = { run, needsSeeding, DEMO_PASSWORD, USERS };

if (require.main === module) {
  run()
    .then(() => { console.log('\nDone.'); process.exit(0); })
    .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
}
