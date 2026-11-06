import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

// The in-page warning banner is a plain IIFE content script (no exports). We load
// it into a jsdom window so we can render showWarning() and assert the real DOM —
// this locks the "Safety score: N / 100" output as a regression.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const overlayCode = readFileSync(join(root, 'src/content/phishing-overlay.js'), 'utf8');

function render(opts) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(overlayCode); // registers window.__SafeCart.showWarning in this window
  dom.window.__SafeCart.showWarning({ fields: [], reasons: [], ...opts });
  return dom.window.document;
}

test('banner shows the 0-100 safety score (not the raw risk score)', () => {
  const doc = render({ verdict: 'dangerous', hostname: 'evil.example', safetyScore: 25 });
  const el = doc.querySelector('.safecart-score');
  assert.ok(el, 'score line should render');
  assert.equal(el.textContent, 'Safety score: 25 / 100');
});

test('missing safetyScore falls back to "?"', () => {
  const doc = render({ verdict: 'suspicious', hostname: 'x.example' });
  assert.equal(doc.querySelector('.safecart-score').textContent, 'Safety score: ? / 100');
});

test('safetyScore of 0 renders as 0 (not "?")', () => {
  const doc = render({ verdict: 'dangerous', hostname: 'x.example', safetyScore: 0 });
  assert.equal(doc.querySelector('.safecart-score').textContent, 'Safety score: 0 / 100');
});

test('title reflects the verdict (dangerous vs suspicious)', () => {
  const danger = render({ verdict: 'dangerous', hostname: 'a', safetyScore: 10 });
  assert.match(danger.querySelector('.safecart-header-title').textContent, /dangerous/i);
  const caution = render({ verdict: 'suspicious', hostname: 'a', safetyScore: 50 });
  assert.match(caution.querySelector('.safecart-header-title').textContent, /suspicious/i);
});

test('hostname is shown', () => {
  const doc = render({ verdict: 'dangerous', hostname: 'shop-deals-now.com', safetyScore: 20 });
  assert.equal(doc.querySelector('.safecart-host').textContent, 'shop-deals-now.com');
});

test('reason details are HTML-escaped (no markup injection)', () => {
  const doc = render({
    verdict: 'dangerous',
    hostname: 'a',
    safetyScore: 5,
    reasons: [{ code: 'x', detail: '<img src=x onerror=alert(1)>' }],
  });
  const li = doc.querySelector('.safecart-reasons li');
  assert.ok(li, 'reason should render');
  assert.ok(li.innerHTML.includes('&lt;img'), 'detail must be HTML-escaped');
  assert.equal(li.querySelector('img'), null, 'no real <img> element should be injected');
});
