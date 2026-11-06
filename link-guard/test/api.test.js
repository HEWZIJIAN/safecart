'use strict';
// End-to-end tests against the real Express app on an ephemeral port.
// Set env BEFORE requiring the app (dotenv won't override already-set vars).
process.env.THREAT_PROVIDER = 'mock';
process.env.RATE_MAX = '1000';        // don't trip the limiter during functional tests
process.env.ALLOWED_ORIGINS = 'http://localhost';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server/index'); // require.main !== module → does NOT auto-listen

let server;
let base;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { if (server) server.close(); });

async function scan(url) {
  const r = await fetch(base + '/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test('safe url returns a safe verdict', async () => {
  const { status, body } = await scan('https://example.com/');
  assert.equal(status, 200);
  assert.equal(body.threat, 'safe');
  assert.equal(body.cached, false);
});

test('lookalike returns malicious', async () => {
  const { body } = await scan('https://paypa1-verify.com/');
  assert.equal(body.threat, 'malicious');
});

test('a repeat request is served from cache', async () => {
  await scan('https://cache-me.example.org/');
  const { body } = await scan('https://cache-me.example.org/');
  assert.equal(body.cached, true);
});

test('invalid scheme → 400 invalid_url', async () => {
  const { status, body } = await scan('javascript:alert(1)');
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_url');
});

test('private host → 400 private_host', async () => {
  const { status, body } = await scan('http://127.0.0.1/');
  assert.equal(status, 400);
  assert.equal(body.error, 'private_host');
});

test('report endpoint accepts a valid claim', async () => {
  const r = await fetch(base + '/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://flagged.example.com/', claim: 'false_positive', note: 'this is my real site' }),
  });
  assert.equal(r.status, 202);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.ok(body.id);
});

test('report endpoint rejects a bad claim', async () => {
  const r = await fetch(base + '/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://x.com/', claim: 'nonsense' }),
  });
  assert.equal(r.status, 400);
});

test('healthz is ok', async () => {
  const r = await fetch(base + '/api/healthz');
  const body = await r.json();
  assert.equal(body.ok, true);
});
