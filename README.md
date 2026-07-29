# Competitive Radar

Competitive Radar is a competitor-intelligence workspace that keeps track of the companies you compete with and turns scattered public activity into a reviewable stream of signals. It registers each competitor along with the sources worth watching — company websites and pricing pages, blog/RSS feeds, job boards, review sites, social accounts, news search, funding databases, SEC filings and executive profiles — then runs collection runs against those sources, deduplicates and scores what comes back, and promotes the meaningful changes into classified signals (pricing moves, product launches, hiring pushes, funding events, leadership changes and more). From there the app rolls signals up into scheduled digests and shareable reports so a product or GTM team can see what moved, why it matters and what changed since the last review — all from a single dashboard with per-competitor timelines, an audit trail and role-based access.

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express (EJS server-rendered views) |
| Database | MySQL |
| Frontend | Bootstrap 5 + custom CSS, Font Awesome icons |
| Scheduling | in-process scheduler for collection runs and digests |

## Project layout

```
collectors/     source adapters + fetcher, registry and mock fixtures
config/         env loading and MySQL connection pool
controllers/    thin HTTP handlers
db/             schema.sql (DDL) and seed.js (demo data)
middleware/     auth guards and central error handling
public/         static CSS / JS assets
routes/         page routes and /api routers
scheduler/      periodic collection + digest jobs
services/       business logic (analysis, digests, reports, runs, signals…)
utils/          formatting, hashing, pagination, nav helpers
views/          EJS templates and partials
server.js       thin entry point
```

## Local setup

Requirements: Node.js 18+ and a reachable MySQL 8 instance.

```bash
git clone https://github.com/michaelrobotai/CompetitiveScanner.git
cd CompetitiveScanner
npm install
cp .env.example .env      # then fill in your own values
```

### Environment variables

The real `.env` file is **not** committed. Copy `.env.example` and set your own values:

| Variable | Purpose |
|---|---|
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `PORT` | HTTP port the Express server listens on |
| `SESSION_SECRET` | secret used to sign session cookies — use a long random string |
| `BASE_PATH` | public URL prefix when running behind a reverse proxy (optional) |
| `COLLECTION_MODE` | `mock` to use bundled fixtures, `live` to call real sources |
| `SCHEDULER_ENABLED` | `true` to run collection/digest jobs in-process |

External integrations (LinkedIn, Crunchbase/funding, SEC, news search) ship with mock
fixtures under `collectors/` so the app is fully explorable without any API keys.

### Create and seed the database

```bash
# 1. create the database, then apply the schema
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < db/schema.sql

# 2. load demo competitors, sources, runs, signals and users
node db/seed.js
```

`db/schema.sql` contains the full DDL in dependency order (parents before children).
`db/seed.js` is idempotent-ish demo data: competitors, their sources, historical
collection runs, collected items, classified signals, digests and application users
with hashed passwords.

### Run

```bash
npm start        # or: node server.js
```

Then open the app in your browser on the configured port and sign in with one of the
seeded accounts (see the credentials printed by `db/seed.js`).

## Docker

A container setup lives in `dockercontainer/` (`Dockerfile`, `docker-compose.yml`,
`.env.example`). See `dockercontainer/README.md` for build and run instructions.

## Security notes

- `.env` and any `.env.*` file are git-ignored; only `.env.example` with placeholder
  keys is committed.
- No credentials, API keys or connection strings are stored in the repository.
- Database connection details and the HTTP port are read from environment variables
  at runtime — nothing is hardcoded.
