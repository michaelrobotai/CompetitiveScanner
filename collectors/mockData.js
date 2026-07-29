'use strict';
// Realistic mock item generators used when an adapter has no credentials
// configured AND demo mode is on (business requirement: the pipeline must be
// demonstrable end to end). Every mock item is flagged is_mock = 1 so the UI
// and audit trail always disclose it.

function pick(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

function hoursAgo(n) {
  return new Date(Date.now() - n * 3600 * 1000);
}

const TEMPLATES = {
  website_page: (c, s) => [
    {
      title: `${c.name} ${s.watch_target} page updated`,
      excerpt: `Detected a content change on the ${s.watch_target} page: 3 sections modified, 1 new tier added, pricing table rows re-ordered.`,
      rawContent: `${c.name} ${s.watch_target} page snapshot. Enterprise tier now lists "usage-based billing" and "dedicated onboarding". Previous copy referenced flat annual pricing only.`,
      changeType: 'changed',
      diffSummary: '+ Enterprise: usage-based billing\n+ Enterprise: dedicated onboarding\n- Flat annual pricing only',
      typeGuess: 'other_strategic_move'
    }
  ],
  blog_rss: (c) => [
    {
      title: `Introducing ${c.name} Atlas — our new AI workflow engine`,
      excerpt: `${c.name} announced the general availability of Atlas, a major platform release adding agentic automation, a redesigned builder and native analytics.`,
      rawContent: `Today we are excited to launch ${c.name} Atlas, the biggest product release in our history. Atlas becomes generally available for all Enterprise customers and introduces agentic automation across the platform.`,
      typeGuess: 'major_product_release'
    },
    {
      title: `${c.name} engineering: scaling to 40 billion events a day`,
      excerpt: 'Engineering deep-dive on infrastructure re-architecture and cost reduction.',
      rawContent: `Our platform team rebuilt the ingestion tier, cutting infrastructure spend 34% while tripling throughput.`,
      typeGuess: 'other_strategic_move'
    }
  ],
  linkedin_company: (c) => [
    {
      title: `${c.name} posted: "A new chapter for our company"`,
      excerpt: `${c.name} hinted at a significant corporate milestone, thanking employees and investors "as we prepare for the next chapter together".`,
      rawContent: `A new chapter for ${c.name}. Today we signed a definitive agreement that will see us join forces with a global platform leader. More details to follow.`,
      author: `${c.name} (company page)`,
      typeGuess: 'merger'
    }
  ],
  linkedin_executive: (c) => [
    {
      title: `CEO of ${c.name} posts about "strategic alternatives"`,
      excerpt: 'Executive post referencing bankers, board process and "evaluating strategic alternatives" — classic acquisition-target language.',
      rawContent: `Personally, this has been the most intense quarter of my career. Our board has retained advisors to evaluate strategic alternatives for ${c.name}, including partnership and sale scenarios.`,
      author: 'Chief Executive Officer',
      typeGuess: 'acquisition_target'
    },
    {
      title: `${c.name} CRO: "record quarter, 3x pipeline"`,
      excerpt: 'Revenue leader publicly celebrating an outsized quarter and pipeline expansion.',
      rawContent: `Closed our largest quarter ever at ${c.name} — 118% of plan, net revenue retention at 131%, and pipeline up 3x year over year.`,
      author: 'Chief Revenue Officer',
      typeGuess: 'unusual_revenue_gain'
    }
  ],
  news_search: (c) => [
    {
      title: `Report: ${c.name} in advanced talks to be acquired`,
      excerpt: `Multiple people familiar with the matter say ${c.name} is in late-stage discussions with a strategic buyer at a valuation near $1.4B.`,
      rawContent: `${c.name} is in advanced talks to be acquired by a larger platform vendor, according to three people familiar with the negotiations. A deal could be announced within weeks.`,
      author: 'Tech press',
      typeGuess: 'acquisition_target'
    },
    {
      title: `${c.name} acquires analytics startup Lumen Metrics`,
      excerpt: `${c.name} announced it has acquired Lumen Metrics to accelerate its embedded analytics roadmap. Terms were not disclosed.`,
      rawContent: `${c.name} today announced the acquisition of Lumen Metrics, a 40-person analytics startup. The Lumen team will join ${c.name}'s data platform group.`,
      author: 'Newswire',
      typeGuess: 'acquiring_company'
    }
  ],
  job_board: (c) => [
    {
      title: `${c.name} opened 14 new roles, incl. "VP Corporate Development"`,
      excerpt: 'Hiring pattern shift: corp-dev, M&A integration and post-merger IT roles posted in the same week.',
      rawContent: `New postings at ${c.name}: VP Corporate Development, Manager M&A Integration, Senior Counsel (Transactions), Director FP&A. Locations: New York, remote.`,
      typeGuess: 'acquiring_company'
    },
    {
      title: `${c.name} job postings dropped 62% month over month`,
      excerpt: 'Sharp contraction in open roles across sales and marketing functions.',
      rawContent: `Open roles at ${c.name} fell from 78 to 30 in four weeks, with the largest reductions in Sales (-24) and Marketing (-11).`,
      typeGuess: 'unusual_revenue_loss'
    }
  ],
  funding_db: (c) => [
    {
      title: `${c.name} raises $120M Series D led by Meridian Growth`,
      excerpt: 'Funding database records a new late-stage round at a reported $1.1B post-money valuation.',
      rawContent: `Round: Series D. Amount: $120,000,000. Lead: Meridian Growth Partners. Post-money valuation: $1.1B. Use of funds cited as international expansion and M&A.`,
      typeGuess: 'unusual_revenue_gain'
    }
  ],
  sec_filing: (c) => [
    {
      title: `${c.name} files 8-K disclosing merger agreement`,
      excerpt: 'Form 8-K, Item 1.01: entry into a material definitive agreement — merger with a wholly owned subsidiary of the acquirer.',
      rawContent: `On the date hereof, ${c.name} entered into an Agreement and Plan of Merger providing for the merger of a wholly owned subsidiary of Parent with and into the Company, with the Company surviving as a wholly owned subsidiary of Parent.`,
      typeGuess: 'merger'
    },
    {
      title: `${c.name} 10-Q: revenue down 19% year over year`,
      excerpt: 'Quarterly filing shows a material revenue decline and a goodwill impairment charge.',
      rawContent: `Total revenue for the quarter was $61.2M, a decrease of 19% compared to the prior-year period. The Company recorded a goodwill impairment charge of $22.4M.`,
      typeGuess: 'unusual_revenue_loss'
    }
  ],
  review_site: (c) => [
    {
      title: `${c.name} G2 rating slipped from 4.5 to 4.1 (128 new reviews)`,
      excerpt: 'Review volume spiked with recurring complaints about pricing changes and support response times.',
      rawContent: `Aggregate rating for ${c.name} declined to 4.1 across 128 new reviews this period. Top negative themes: unexpected price increase (41 mentions), slow support (33), migration difficulty (19).`,
      typeGuess: 'unusual_revenue_loss'
    }
  ],
  social: (c) => [
    {
      title: `Chatter spike about ${c.name} on X and Reddit`,
      excerpt: 'Mention volume up 4.6x in 24 hours, dominated by speculation about an imminent announcement.',
      rawContent: `r/SaaS thread "Is ${c.name} getting bought?" reached 1.2k upvotes. On X, mention volume rose 4.6x with employees changing bios and recruiters referencing a "quiet period".`,
      typeGuess: 'acquisition_target'
    }
  ]
};

function generate(connectorKey, competitor, source) {
  const factory = TEMPLATES[connectorKey];
  if (!factory) return [];
  const seed = hashSeed(`${connectorKey}:${competitor.id}:${competitor.name}`);
  const all = factory(competitor, source || { watch_target: 'other' });
  // Deterministic subset so repeat runs are stable and dedupe is exercised.
  const count = all.length === 1 ? 1 : 1 + (Math.abs(seed) % all.length);
  return all.slice(0, count).map((tpl, idx) => ({
    ...tpl,
    publishedAt: idx === 0 ? hoursAgo(2 + (Math.abs(seed) % 30)) : daysAgo(1 + idx),
    isMock: 1
  }));
}

module.exports = { generate, pick, hashSeed, daysAgo, hoursAgo };
