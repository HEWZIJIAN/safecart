'use strict';
/**
 * Threat-intelligence integration.
 *
 * Default provider is a MOCK so the whole feature runs end-to-end with no API key.
 * Set THREAT_PROVIDER=google|virustotal plus the matching key to go live — the real
 * request code below is already normalized to the same response shape.
 *
 * Standardized result (everything downstream depends on this shape):
 *   { threat: 'safe'|'suspicious'|'malicious'|'unknown', score: 0..100,
 *     sources: string[], raw?: any }
 *
 * 'unknown' is returned only when the upstream call fails/times out — the route +
 * frontend treat it as "couldn't verify" (fail-open by default; see README).
 */

const PROVIDER = (process.env.THREAT_PROVIDER || 'mock').toLowerCase();
const UPSTREAM_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 4000);

function verdictFromScore(score) {
  if (score >= 70) return 'malicious';
  if (score >= 30) return 'suspicious';
  return 'safe';
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── MOCK provider ──────────────────────────────────────────────────────────
// Deterministic heuristics so the demo is meaningful. This is NOT a real scanner;
// it only illustrates the response contract the real providers conform to.
const MOCK_BLOCKLIST = new Set(['testsafebrowsing.appspot.com', 'malware.testing.google.test']);
const LOOKALIKE = /(paypa1|amaz0n|g00gle|micros0ft|netf1ix|app1e|faceb00k|coinbasse)/i;

function mockScan(url, host) {
  const u = url.toLowerCase();
  let score = 0;
  const reasons = [];

  if (MOCK_BLOCKLIST.has(host)) { score = 100; reasons.push('known_test_threat'); }
  if (/(phish|malware|trojan|\.scam\b)/.test(u)) { score = Math.max(score, 90); reasons.push('threat_keyword'); }
  if (host.startsWith('xn--')) { score = Math.max(score, 65); reasons.push('punycode_homograph'); }
  if (LOOKALIKE.test(host)) { score = Math.max(score, 78); reasons.push('brand_lookalike'); }
  if ((host.match(/\./g) || []).length >= 4) { score = Math.max(score, 40); reasons.push('deep_subdomains'); }
  if (/[0-9-]{8,}/.test(host)) { score = Math.max(score, 35); reasons.push('random_looking_host'); }

  return { threat: verdictFromScore(score), score, sources: reasons.length ? reasons : ['mock:clean'], raw: { provider: 'mock', reasons } };
}

// ─── Google Web Risk (Lookup API) ───────────────────────────────────────────
// Docs: https://cloud.google.com/web-risk/docs/lookup-api
async function googleScan(url) {
  const key = process.env.GOOGLE_WEB_RISK_API_KEY;
  const qs = new URLSearchParams();
  qs.set('key', key);
  qs.set('uri', url);
  for (const t of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) qs.append('threatTypes', t);

  const res = await fetchWithTimeout(`https://webrisk.googleapis.com/v1/uris:search?${qs.toString()}`);
  if (!res.ok) throw new Error(`web_risk_http_${res.status}`);
  const data = await res.json();
  const found = data?.threat?.threatTypes || [];
  const score = found.length ? 95 : 0;
  return { threat: verdictFromScore(score), score, sources: found.length ? found : ['google_web_risk:clean'], raw: data };
}

// ─── VirusTotal v3 ──────────────────────────────────────────────────────────
// Docs: https://docs.virustotal.com/reference/url-info
// VT addresses a URL by base64url(url) with padding stripped.
function vtUrlId(url) {
  return Buffer.from(url).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function virustotalScan(url) {
  const key = process.env.VIRUSTOTAL_API_KEY;
  const res = await fetchWithTimeout(`https://www.virustotal.com/api/v3/urls/${vtUrlId(url)}`, {
    headers: { 'x-apikey': key },
  });
  // 404 = VT has never analyzed this URL. In production you'd POST it to /urls to
  // queue a scan and poll the analysis id; for pre-click UX we treat an unseen URL
  // as low-confidence safe rather than block the user on a cold cache.
  if (res.status === 404) return { threat: 'safe', score: 0, sources: ['virustotal:unseen'], raw: null };
  if (!res.ok) throw new Error(`virustotal_http_${res.status}`);
  const data = await res.json();
  const stats = data?.data?.attributes?.last_analysis_stats || {};
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  const score = Math.min(100, malicious * 25 + suspicious * 10);
  return { threat: verdictFromScore(score), score, sources: ['virustotal'], raw: stats };
}

// ─── Public API ─────────────────────────────────────────────────────────────
async function scanUrl({ url, host }) {
  try {
    if (PROVIDER === 'google' && process.env.GOOGLE_WEB_RISK_API_KEY) return await googleScan(url);
    if (PROVIDER === 'virustotal' && process.env.VIRUSTOTAL_API_KEY) return await virustotalScan(url);
    return mockScan(url, host);
  } catch (err) {
    // Upstream failure → fail OPEN but mark low confidence. (See README for the
    // fail-open vs fail-closed discussion. The frontend surfaces a soft warning.)
    return { threat: 'unknown', score: 0, sources: ['scanner_error'], error: String(err && err.message || err) };
  }
}

module.exports = { scanUrl, PROVIDER, verdictFromScore };
