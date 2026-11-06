import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { toSafetyScore, safetyBand, safetyMeta } from '../src/lib/score.js';
import { splitDomain, brandCoreOf, isOfficialBrandDomain, getETLDPlusOne } from '../src/lib/url-utils.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const brands = JSON.parse(readFileSync(join(root, 'src/data/known-merchants.json'), 'utf8')).brands;
const heuristics = JSON.parse(readFileSync(join(root, 'src/data/phishing-heuristics.json'), 'utf8'));
const BRAND_CORES = new Set(brands.map(brandCoreOf));
const BRAND_TLDS = new Set(heuristics.brandTlds);

// Mirror the engine: official brand domains never reach the impersonation flags.
const official = (host) => isOfficialBrandDomain(getETLDPlusOne(host), BRAND_CORES, BRAND_TLDS);

// ── Task 1: safety-score mapping (risk -> 0-100 safety) ─────────────────────
test('risk 0 maps to safety 100 (fully safe)', () => {
  assert.equal(toSafetyScore(0), 100);
});

test('safe band: risk below SUSPICIOUS(40) -> safety >= 67 (green)', () => {
  assert.ok(toSafetyScore(0) >= 67);
  assert.ok(toSafetyScore(39) >= 67);
});

test('caution band: 40 <= risk < 70 -> safety 34..66 (orange)', () => {
  for (const r of [40, 55, 69]) {
    const s = toSafetyScore(r);
    assert.ok(s >= 34 && s <= 66, `risk ${r} -> safety ${s} should be 34..66`);
  }
});

test('dangerous band: risk >= 70 -> safety <= 33 (red), bottoming at 0', () => {
  assert.ok(toSafetyScore(70) <= 33);
  assert.equal(toSafetyScore(200), 0);
});

test('color bands line up with the verdict thresholds', () => {
  assert.equal(safetyBand(toSafetyScore(39)), 'safe');       // < 40 risk
  assert.equal(safetyBand(toSafetyScore(40)), 'caution');    // == SUSPICIOUS
  assert.equal(safetyBand(toSafetyScore(69)), 'caution');
  assert.equal(safetyBand(toSafetyScore(70)), 'dangerous');  // == DANGEROUS
});

test('safety score is monotonic (more risk never raises safety)', () => {
  let prev = 101;
  for (let r = 0; r <= 150; r += 5) {
    const s = toSafetyScore(r);
    assert.ok(s <= prev, `safety should not increase with risk at r=${r}`);
    prev = s;
  }
});

test('safetyMeta maps bands to color + label; null -> unknown', () => {
  assert.deepEqual(
    [safetyMeta(90).color, safetyMeta(90).label],
    ['green', 'Safe'],
  );
  assert.equal(safetyMeta(50).color, 'yellow');
  assert.equal(safetyMeta(10).color, 'red');
  assert.equal(safetyMeta(null).label, 'Unknown');
});

// ── Task 2: TLD-aware brand impersonation ───────────────────────────────────
test('splitDomain separates core and (multi-part) suffix', () => {
  assert.deepEqual(splitDomain('amazon.com'), { core: 'amazon', suffix: 'com' });
  assert.deepEqual(splitDomain('amazon.de'), { core: 'amazon', suffix: 'de' });
  assert.deepEqual(splitDomain('amazon.co.uk'), { core: 'amazon', suffix: 'co.uk' });
});

test('official regional brand domains are recognized as Safe', () => {
  for (const host of [
    'amazon.com', 'www.amazon.de', 'amazon.co.uk', 'amazon.fr', 'smile.amazon.de',
    'paypal.com', 'paypal.fr', 'google.de', 'argos.co.uk', 'ebay.de',
  ]) {
    assert.ok(official(host), `${host} should be an official brand domain`);
  }
});

test('typo-squatters and suffix abuse are NOT treated as official', () => {
  for (const host of [
    'amaz0n.de',            // homoglyph in the label
    'amazon-login.de',      // extra word in the registrable label
    'amazon.tk',            // brand label but a non-allowlisted/abused TLD
    'amazon.de.evil.com',   // brand only in a subdomain; eTLD+1 is evil.com
    'paypa1.com',           // classic lookalike
    'notabrand.de',         // not a brand at all
  ]) {
    assert.ok(!official(host), `${host} must NOT be treated as official`);
  }
});
