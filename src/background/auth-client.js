// =============================================================================
// SafeCart auth client.
// -----------------------------------------------------------------------------
// Talks directly to Supabase Auth REST endpoints. The access token returned by
// Supabase is the bearer used on all SafeCart Workers requests.
//
// Data flow:
//   Extension service worker  ──HTTPS──▶  <SUPABASE_URL>/auth/v1/*
//                             ◀──HTTPS──  { access_token, refresh_token, user }
//   Tokens persisted to chrome.storage.local. No SafeCart server sees the
//   password — it goes straight to Supabase.
// =============================================================================

import { getSettings } from './storage.js';
import { STORAGE_KEYS } from '../lib/constants.js';

const REFRESH_SKEW_MS = 60_000;

function nowMs() { return Date.now(); }

async function getSupabaseConfig() {
  const settings = await getSettings();
  const url = (settings.supabaseUrl || '').trim().replace(/\/+$/, '');
  const anonKey = (settings.supabaseAnonKey || '').trim();
  if (!url || !anonKey) {
    return { ok: false, error: 'supabase_not_configured' };
  }
  return { ok: true, url, anonKey };
}

async function supabaseFetch(path, init = {}) {
  const cfg = await getSupabaseConfig();
  if (!cfg.ok) return { ok: false, error: cfg.error };
  const response = await fetch(`${cfg.url}/auth/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: cfg.anonKey,
      'Content-Type': 'application/json',
    },
  });
  return { ok: true, response };
}

async function persistSession(session) {
  const record = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: nowMs() + (session.expires_in || 3600) * 1000,
    user: session.user ? { id: session.user.id, email: session.user.email } : null,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.SUPABASE_SESSION]: record });
  return record;
}

async function clearSession() {
  await chrome.storage.local.remove(STORAGE_KEYS.SUPABASE_SESSION);
}

async function getStoredSession() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SUPABASE_SESSION);
  return result[STORAGE_KEYS.SUPABASE_SESSION] || null;
}

export async function signUp(email, password) {
  const wrapped = await supabaseFetch('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!wrapped.ok) return { ok: false, error: wrapped.error };
  const data = await wrapped.response.json();
  if (!wrapped.response.ok) {
    return { ok: false, error: data?.error_description || data?.msg || `http_${wrapped.response.status}` };
  }
  if (data.access_token) {
    const session = await persistSession(data);
    return { ok: true, session, needsConfirmation: false };
  }
  // Email confirmation required; no tokens issued yet.
  return { ok: true, session: null, needsConfirmation: true };
}

export async function signIn(email, password) {
  const wrapped = await supabaseFetch('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!wrapped.ok) return { ok: false, error: wrapped.error };
  const data = await wrapped.response.json();
  if (!wrapped.response.ok) {
    return { ok: false, error: data?.error_description || data?.msg || `http_${wrapped.response.status}` };
  }
  const session = await persistSession(data);
  return { ok: true, session };
}

export async function signOut() {
  const session = await getStoredSession();
  if (session?.accessToken) {
    const wrapped = await supabaseFetch('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (wrapped.ok) await wrapped.response.text().catch(() => null);
  }
  await clearSession();
  return { ok: true };
}

async function refresh(session) {
  const wrapped = await supabaseFetch('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!wrapped.ok) return null;
  const data = await wrapped.response.json();
  if (!wrapped.response.ok) return null;
  return persistSession(data);
}

// Single-flight refresh: when multiple callers hit getAccessToken() concurrently
// with an expired token, they all share one in-flight refresh promise instead of
// each firing their own. Supabase refresh tokens are single-use; parallel refresh
// attempts would race and all but one would fail.
let refreshInFlight = null;

export async function getAccessToken() {
  const session = await getStoredSession();
  if (!session?.accessToken || !session.refreshToken) return null;
  if (nowMs() < session.expiresAt - REFRESH_SKEW_MS) {
    return session.accessToken;
  }
  if (!refreshInFlight) {
    refreshInFlight = refresh(session).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  return refreshed?.accessToken || null;
}

export async function getAuthHeader() {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function getCurrentSessionSummary() {
  const session = await getStoredSession();
  if (!session) return { signedIn: false };
  return {
    signedIn: true,
    email: session.user?.email || null,
    userId: session.user?.id || null,
    expiresAt: session.expiresAt,
  };
}
