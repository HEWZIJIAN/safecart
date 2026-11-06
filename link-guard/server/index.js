'use strict';
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('./lib/rateLimit');
const scanRoute = require('./routes/scan');
const reportRoute = require('./routes/report');

const app = express();

// Behind a proxy/load balancer? Set TRUST_PROXY (number of hops) so req.ip is the
// real client IP — otherwise the rate limiter keys everyone to the proxy address.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// Lock CORS to your own site origin(s). Browsers block direct cross-origin scanning
// (CORS) anyway — that's exactly why this proxy exists.
const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:8787')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / tools with no Origin header (curl, server-to-server).
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST'],
    maxAge: 600,
  })
);

// We only ever accept a tiny { url } body — cap it hard.
app.use(express.json({ limit: '8kb' }));

// Rate-limit the API surface (protects the upstream threat-API key/quota).
app.use(
  '/api',
  rateLimit({
    windowMs: Number(process.env.RATE_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_MAX || 30),
  })
);

app.use('/api', scanRoute);
app.use('/api', reportRoute);

// Serve the drop-in frontend assets + demo page (optional convenience).
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// JSON 404 + error handler.
app.use((req, res) => res.status(404).json({ error: 'not_found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = /CORS/.test(err.message) ? 403 : 500;
  res.status(status).json({ error: status === 403 ? 'forbidden' : 'server_error', message: err.message });
});

const PORT = Number(process.env.PORT || 8787);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`link-guard on :${PORT}  ·  provider=${process.env.THREAT_PROVIDER || 'mock'}  ·  origins=${allowed.join(', ')}`);
  });
}

module.exports = app;
