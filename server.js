'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const routes = require('./routes');
const { attachUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const format = require('./utils/format');
const { u, withQuery } = require('./utils/nav');
const pagination = require('./utils/pagination');
const sources = require('./services/sources.service');
const scheduler = require('./scheduler');

const app = express();
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(session({
  name: 'radar.sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(attachUser);

// View helpers available to every template.
app.use((req, res, next) => {
  res.locals.u = u;
  res.locals.withQuery = withQuery;
  res.locals.f = format;
  res.locals.qs = pagination.queryString;
  res.locals.demoMode = env.demoMode;
  res.locals.query = req.query || {};
  res.locals.currentPath = req.path;
  next();
});

app.use('/', routes);
app.use(notFound);
app.use(errorHandler);

async function bootstrap() {
  try {
    await sources.syncConnectors();
    console.log('[boot] connector registry synced');
  } catch (err) {
    console.error('[boot] connector sync failed (continuing):', err.message);
  }

  // First-boot demo data. Idempotent and never fatal: the app must start even
  // if seeding fails, so a seed error is logged rather than thrown.
  try {
    const seeder = require('./db/seed');
    if (await seeder.needsSeeding()) {
      console.log('[boot] empty database detected — seeding demo data…');
      await seeder.run();
      console.log('[boot] demo data seeded');
    } else {
      console.log('[boot] database already populated — skipping seed');
    }
  } catch (err) {
    console.error('[boot] demo seed failed (continuing):', err.message);
  }

  scheduler.start();
}

const PORT = process.env.PORT;
if (!PORT) {
  throw new Error('PORT is not set — the runtime must inject it. Refusing to start on a guessed port.');
}
app.listen(PORT, () => {
  console.log(`[boot] Competitive Radar listening on port ${PORT} (base path "${env.basePath || '/'}")`);
  bootstrap();
});

module.exports = app;
