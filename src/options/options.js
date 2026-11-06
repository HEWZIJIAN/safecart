const STORAGE_KEY = 'safecart.settings';
const DEFAULT_SERVER = 'http://localhost:8787';
const DEFAULTS = {
  safeBrowsingApiKey: '',
  phishTankApiKey: '',
  enablePhishingDetection: true,
  enablePaymentTracking: true,
  enableBreachMonitoring: true,
  sensitivityBoost: 0,
  subscriptionServerUrl: DEFAULT_SERVER,
  supabaseUrl: '',
  supabaseAnonKey: '',
};

async function load() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const settings = { ...DEFAULTS, ...(result[STORAGE_KEY] || {}) };
  document.getElementById('sb-key').value = settings.safeBrowsingApiKey;
  document.getElementById('pt-key').value = settings.phishTankApiKey;
  document.getElementById('enabled').checked = settings.enablePhishingDetection;
  document.getElementById('enable-payments').checked = settings.enablePaymentTracking;
  document.getElementById('enable-breach').checked = settings.enableBreachMonitoring;
  document.getElementById('server-url').value = settings.subscriptionServerUrl || DEFAULT_SERVER;
  document.getElementById('supabase-url').value = settings.supabaseUrl || '';
  document.getElementById('supabase-anon').value = settings.supabaseAnonKey || '';
  await refreshGmailStatus();
  await refreshAuthStatus();
  await refreshSubscriptionStatus();
}

async function save() {
  const next = {
    safeBrowsingApiKey: document.getElementById('sb-key').value.trim(),
    phishTankApiKey: document.getElementById('pt-key').value.trim(),
    enablePhishingDetection: document.getElementById('enabled').checked,
    enablePaymentTracking: document.getElementById('enable-payments').checked,
    enableBreachMonitoring: document.getElementById('enable-breach').checked,
    sensitivityBoost: 0,
    subscriptionServerUrl: document.getElementById('server-url').value.trim() || DEFAULT_SERVER,
    supabaseUrl: document.getElementById('supabase-url').value.trim(),
    supabaseAnonKey: document.getElementById('supabase-anon').value.trim(),
  };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  const status = document.getElementById('status');
  status.textContent = 'Saved';
  setTimeout(() => (status.textContent = ''), 1500);
}

function getAuthToken(interactive) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve({ ok: false, error: chrome.runtime.lastError?.message || 'no_token' });
        return;
      }
      resolve({ ok: true, token });
    });
  });
}

async function refreshGmailStatus() {
  const el = document.getElementById('gmail-status');
  const result = await getAuthToken(false);
  if (result.ok) {
    el.textContent = 'Connected';
    el.style.color = '#2f9e44';
  } else {
    el.textContent = 'Not connected';
    el.style.color = '#868e96';
  }
}

async function connectGmail() {
  const el = document.getElementById('gmail-status');
  el.textContent = 'Connecting…';
  el.style.color = '#1971c2';
  const result = await getAuthToken(true);
  if (result.ok) {
    el.textContent = 'Connected';
    el.style.color = '#2f9e44';
  } else {
    el.textContent = `Failed: ${result.error}`;
    el.style.color = '#c92a2a';
  }
}

document.getElementById('save').addEventListener('click', save);
document.getElementById('connect-gmail').addEventListener('click', connectGmail);

document.getElementById('breach-scan').addEventListener('click', () => {
  const status = document.getElementById('breach-scan-status');
  status.textContent = 'Scanning…';
  chrome.runtime.sendMessage({ type: 'safecart/breach-scan-now', payload: { forceAll: true } }, (res) => {
    if (chrome.runtime.lastError || !res) { status.textContent = 'Scan failed.'; return; }
    if (!res.ok) { status.textContent = `Scan failed: ${res.error || 'unknown'}`; return; }
    const s = res.summary || {};
    status.textContent = `Checked ${s.checked || 0}, ${s.newBreaches || 0} new breach${s.newBreaches === 1 ? '' : 'es'}.`;
  });
});

document.getElementById('open-breaches').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('src/breaches/breaches.html') });
});

async function refreshSubscriptionStatus() {
  const tierEl = document.getElementById('sub-tier');
  const statusEl = document.getElementById('sub-status');
  tierEl.textContent = 'Loading…';
  statusEl.textContent = '';
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'safecart/subscription-get', payload: {} }, (response) => {
      if (chrome.runtime.lastError) { resolve({ ok: false }); return; }
      resolve(response || { ok: false });
    });
  });
  if (!res.ok || !res.subscription) {
    tierEl.textContent = 'Unknown';
    return;
  }
  const sub = res.subscription;
  const tierLabel = { free: 'Free', premium: 'Premium', family: 'Family' }[sub.tier] || sub.tier;
  tierEl.textContent = `Tier: ${tierLabel}`;
  const bits = [`status: ${sub.status}`];
  if (sub.currentPeriodEnd) {
    const word = sub.cancelAtPeriodEnd ? 'ends' : 'renews';
    bits.push(`${word} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`);
  }
  statusEl.textContent = bits.join(' · ');
}

document.getElementById('sub-refresh').addEventListener('click', async () => {
  const statusEl = document.getElementById('sub-status');
  statusEl.textContent = 'Refreshing…';
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'safecart/subscription-refresh', payload: {} }, () => resolve());
  });
  refreshSubscriptionStatus();
});

function sendMsg(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
      resolve(response || { ok: false });
    });
  });
}

async function refreshAuthStatus() {
  const res = await sendMsg('safecart/auth-get-session');
  const signedOutBlock = document.getElementById('auth-signed-out');
  const signedInBlock = document.getElementById('auth-signed-in');
  if (res?.session?.signedIn) {
    signedOutBlock.hidden = true;
    signedInBlock.hidden = false;
    document.getElementById('auth-current').textContent = `Signed in as ${res.session.email}`;
  } else {
    signedOutBlock.hidden = false;
    signedInBlock.hidden = true;
  }
}

async function doAuth(type) {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const status = document.getElementById('auth-status');
  if (!email || !password) { status.textContent = 'Email and password required.'; status.style.color = '#c92a2a'; return; }
  status.textContent = type === 'safecart/auth-sign-up' ? 'Creating account…' : 'Signing in…';
  status.style.color = '#1971c2';
  // Save Supabase config first so the auth client can read it.
  await save();
  const res = await sendMsg(type, { email, password });
  if (!res?.ok) {
    status.textContent = `Failed: ${res?.error || 'unknown'}`;
    status.style.color = '#c92a2a';
    return;
  }
  if (res.needsConfirmation) {
    status.textContent = 'Check your inbox to confirm your email.';
    status.style.color = '#2b8a3e';
    return;
  }
  status.textContent = 'Signed in.';
  status.style.color = '#2b8a3e';
  document.getElementById('auth-password').value = '';
  await refreshAuthStatus();
  await refreshSubscriptionStatus();
}

document.getElementById('auth-signin').addEventListener('click', () => doAuth('safecart/auth-sign-in'));
document.getElementById('auth-signup').addEventListener('click', () => doAuth('safecart/auth-sign-up'));
document.getElementById('auth-signout').addEventListener('click', async () => {
  await sendMsg('safecart/auth-sign-out');
  await refreshAuthStatus();
  await refreshSubscriptionStatus();
});

document.getElementById('sub-portal').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'safecart/subscription-portal', payload: {} }, (res) => {
    if (res?.ok && res.url) chrome.tabs.create({ url: res.url });
    else alert(`Could not open billing portal: ${res?.error || 'unknown'}.\n\nDo you have an active subscription?`);
  });
});

load();
