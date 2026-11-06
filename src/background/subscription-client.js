import { getSubscription, setSubscription, getSettings } from './storage.js';
import { getAuthHeader } from './auth-client.js';
import { ALARMS, TIERS, SUBSCRIPTION_REFRESH_HOURS, DEFAULT_SUBSCRIPTION_SERVER } from '../lib/constants.js';

const FETCH_TIMEOUT_MS = 10_000;

async function getServerBase() {
  const settings = await getSettings();
  const raw = (settings.subscriptionServerUrl || DEFAULT_SUBSCRIPTION_SERVER).trim();
  return raw.replace(/\/+$/, '');
}

export async function backendFetch(path, init = {}) {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { ok: false, status: 401, signedOut: true };
  const base = await getServerBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...authHeader,
      },
      signal: controller.signal,
    });
    return { ok: true, response };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshSubscription() {
  const wrapped = await backendFetch('/api/subscription', { method: 'GET' });
  if (!wrapped.ok) {
    if (wrapped.signedOut) {
      await setSubscription({ tier: TIERS.FREE, status: 'inactive', lastError: 'signed_out' });
      return { ok: false, error: 'signed_out' };
    }
    await setSubscription({ lastError: wrapped.error });
    return { ok: false, error: wrapped.error };
  }
  if (!wrapped.response.ok) {
    return { ok: false, error: `http_${wrapped.response.status}` };
  }
  const data = await wrapped.response.json();
  const updated = await setSubscription({
    tier: data.tier || TIERS.FREE,
    status: data.status || 'inactive',
    currentPeriodEnd: data.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    hasStripeCustomer: Boolean(data.hasStripeCustomer),
    lastError: null,
  });
  return { ok: true, subscription: updated };
}

export async function startCheckout(tier) {
  if (tier !== TIERS.PREMIUM && tier !== TIERS.FAMILY) {
    return { ok: false, error: 'invalid_tier' };
  }
  const wrapped = await backendFetch('/api/stripe/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier }),
  });
  if (!wrapped.ok) {
    return { ok: false, error: wrapped.signedOut ? 'sign_in_required' : wrapped.error };
  }
  if (!wrapped.response.ok) {
    const detail = await safeJson(wrapped.response);
    return { ok: false, error: detail?.error || `http_${wrapped.response.status}`, detail };
  }
  const data = await wrapped.response.json();
  if (!data?.url) return { ok: false, error: 'no_url' };
  pollAfterCheckout();
  return { ok: true, url: data.url, sessionId: data.sessionId };
}

export async function openBillingPortal() {
  const wrapped = await backendFetch('/api/stripe/billing-portal', { method: 'POST' });
  if (!wrapped.ok) return { ok: false, error: wrapped.signedOut ? 'sign_in_required' : wrapped.error };
  if (!wrapped.response.ok) {
    const detail = await safeJson(wrapped.response);
    return { ok: false, error: detail?.error || `http_${wrapped.response.status}` };
  }
  const data = await wrapped.response.json();
  if (!data?.url) return { ok: false, error: 'no_url' };
  return { ok: true, url: data.url };
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

let pollHandle = null;
function pollAfterCheckout() {
  if (pollHandle) return;
  const startedAt = Date.now();
  const TOTAL_MS = 5 * 60 * 1000;
  const INTERVAL_MS = 5_000;
  pollHandle = setInterval(async () => {
    const result = await refreshSubscription();
    const current = await getSubscription();
    const upgraded = current.tier === TIERS.PREMIUM || current.tier === TIERS.FAMILY;
    if (upgraded || Date.now() - startedAt > TOTAL_MS) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    if (!result.ok && Date.now() - startedAt > TOTAL_MS) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }, INTERVAL_MS);
}

export function ensureRefreshAlarm() {
  chrome.alarms.get(ALARMS.SUBSCRIPTION_REFRESH, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARMS.SUBSCRIPTION_REFRESH, {
        delayInMinutes: 2,
        periodInMinutes: SUBSCRIPTION_REFRESH_HOURS * 60,
      });
    }
  });
}

export function isSubscriptionAlarm(alarmName) {
  return alarmName === ALARMS.SUBSCRIPTION_REFRESH;
}

export function isPremium(subscription) {
  return subscription?.tier === TIERS.PREMIUM || subscription?.tier === TIERS.FAMILY;
}
