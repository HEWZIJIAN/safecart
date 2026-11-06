// Calls Safe Browsing, PhishTank, and HIBP — through the SafeCart Workers
// proxy when the user is signed in (so the secret API keys live on the
// server). Falls back to direct calls using the user's own API keys when
// no auth header is available.

import { backendFetch } from '../background/subscription-client.js';

const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const PHISHTANK_ENDPOINT = 'https://checkurl.phishtank.com/checkurl/';
const RDAP_ENDPOINT = 'https://rdap.org/domain/';

const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryProxy(path, init) {
  try {
    const wrapped = await backendFetch(path, init);
    if (!wrapped.ok) return { used: false, reason: wrapped.signedOut ? 'signed_out' : wrapped.error };
    if (wrapped.response.status === 401 || wrapped.response.status === 403) {
      return { used: false, reason: 'unauthenticated' };
    }
    return { used: true, response: wrapped.response };
  } catch (err) {
    return { used: false, reason: err.message };
  }
}

export async function checkSafeBrowsing(url, fallbackApiKey) {
  const proxied = await tryProxy('/api/proxy/safe-browsing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (proxied.used) {
    if (!proxied.response.ok) {
      return { available: true, match: false, error: `proxy_${proxied.response.status}` };
    }
    return proxied.response.json();
  }

  if (!fallbackApiKey) return { available: false, match: false, reason: proxied.reason };
  const body = {
    client: { clientId: 'safecart-extension', clientVersion: '0.1.0' },
    threatInfo: {
      threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  };
  try {
    const response = await fetchWithTimeout(`${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(fallbackApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { available: true, match: false, error: `http_${response.status}` };
    const data = await response.json();
    const matches = data.matches || [];
    return { available: true, match: matches.length > 0, threatTypes: matches.map((m) => m.threatType) };
  } catch (err) {
    return { available: true, match: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }
}

export async function checkPhishTank(url, fallbackApiKey) {
  const proxied = await tryProxy('/api/proxy/phishtank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (proxied.used) {
    if (!proxied.response.ok) {
      return { available: true, match: false, error: `proxy_${proxied.response.status}` };
    }
    return proxied.response.json();
  }

  const params = new URLSearchParams({ url, format: 'json' });
  if (fallbackApiKey) params.set('app_key', fallbackApiKey);
  try {
    const response = await fetchWithTimeout(PHISHTANK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) return { available: true, match: false, error: `http_${response.status}` };
    const data = await response.json();
    const results = data?.results || {};
    return {
      available: true,
      match: Boolean(results.in_database && results.valid),
      verifiedPhish: Boolean(results.verified),
    };
  } catch (err) {
    return { available: true, match: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }
}

export async function getDomainAgeDays(domain) {
  try {
    const response = await fetchWithTimeout(`${RDAP_ENDPOINT}${encodeURIComponent(domain)}`);
    if (!response.ok) return { available: false, error: `http_${response.status}` };
    const data = await response.json();
    const events = data?.events || [];
    const registration = events.find((e) => e.eventAction === 'registration');
    if (!registration?.eventDate) return { available: false, error: 'no_registration_event' };
    const registeredAt = new Date(registration.eventDate);
    if (Number.isNaN(registeredAt.getTime())) return { available: false, error: 'bad_date' };
    const ageDays = Math.floor((Date.now() - registeredAt.getTime()) / (1000 * 60 * 60 * 24));
    return { available: true, ageDays, registeredAt: registration.eventDate };
  } catch (err) {
    return { available: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }
}

export async function getBreachesForDomain(domain) {
  const proxied = await tryProxy(`/api/proxy/hibp/breaches?domain=${encodeURIComponent(domain)}`, { method: 'GET' });
  if (proxied.used) {
    if (proxied.response.status === 429) {
      const retryAfter = parseInt(proxied.response.headers.get('retry-after') || '5', 10);
      const err = new Error('hibp_rate_limited');
      err.retryAfter = retryAfter;
      throw err;
    }
    if (!proxied.response.ok) throw new Error(`proxy_${proxied.response.status}`);
    const data = await proxied.response.json();
    return Array.isArray(data) ? data : [];
  }

  const response = await fetchWithTimeout(`https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`, {
    headers: {
      'User-Agent': 'SafeCart-Extension/0.1 (Chrome extension; +github)',
      Accept: 'application/json',
    },
  }, 8000);
  if (response.status === 404) return [];
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
    const err = new Error('hibp_rate_limited');
    err.retryAfter = retryAfter;
    throw err;
  }
  if (!response.ok) throw new Error(`hibp_http_${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
