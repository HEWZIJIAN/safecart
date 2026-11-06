import { getTrackedMerchants, getBreachRecords } from '../background/storage.js';
import { recommendationsFor } from '../background/breach-monitor.js';
import { MSG } from '../lib/constants.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fmtTime(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return new Date(ts).toLocaleString();
}

function targetDomainFromHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return params.get('domain');
}

function badge(record) {
  if (!record || !record.lastCheckedAt) return { cls: 'badge-unchecked', label: 'Not yet checked' };
  if (record.lastError) return { cls: 'badge-error', label: 'Check failed' };
  const active = (record.breaches || []).filter((b) => !b.dismissedAt).length;
  if (active > 0) return { cls: 'badge-breached', label: `${active} breach${active > 1 ? 'es' : ''}` };
  return { cls: 'badge-clean', label: 'No known breach' };
}

function renderBreach(domain, breach) {
  const recs = recommendationsFor(breach.dataClasses);
  const chips = (breach.dataClasses || []).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');
  return `
    <div class="breach ${breach.dismissedAt ? 'dismissed' : ''}">
      <div class="breach-title">${escapeHtml(breach.title)}</div>
      <div class="breach-meta">
        Breach date: ${escapeHtml(breach.breachDate || 'unknown')}
        · Affected accounts: ${escapeHtml(fmtCount(breach.pwnCount || 0))}
        ${breach.isVerified ? '· Verified by HIBP' : ''}
      </div>
      ${breach.description ? `<div class="breach-desc">${escapeHtml(breach.description)}</div>` : ''}
      ${chips ? `<div class="breach-leaked"><strong>Leaked data:</strong><br/>${chips}</div>` : ''}
      <div><strong style="font-size:13px;">What to do next:</strong></div>
      <ul class="recs">${recs.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      <div class="breach-actions">
        ${breach.dismissedAt ? '' : `<button class="secondary" data-action="dismiss" data-domain="${escapeHtml(domain)}" data-name="${escapeHtml(breach.name)}">Mark as handled</button>`}
        <a class="secondary" href="https://haveibeenpwned.com/PwnedWebsites#${escapeHtml(breach.name)}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;line-height:1;">HIBP details ↗</a>
      </div>
    </div>
  `;
}

function renderMerchant(domain, merchant, record) {
  const b = badge(record);
  const breaches = (record?.breaches || []);
  const breachHtml = breaches.length === 0
    ? '<div class="empty">No breach records.</div>'
    : breaches.map((br) => renderBreach(domain, br)).join('');

  return `
    <div class="merchant" data-domain="${escapeHtml(domain)}">
      <div class="merchant-head">
        <div>
          <div class="merchant-title">${escapeHtml(merchant.displayName || domain)}</div>
          <div class="merchant-meta">
            ${escapeHtml(domain)} · ${merchant.paymentCount || 0} payment${merchant.paymentCount === 1 ? '' : 's'}
            · last scan ${escapeHtml(fmtTime(record?.lastCheckedAt))}
          </div>
        </div>
        <div>
          <span class="merchant-badge ${b.cls}">${escapeHtml(b.label)}</span>
        </div>
      </div>
      ${breachHtml}
      <div class="breach-actions" style="margin-top:14px;">
        <button class="danger" data-action="untrack" data-domain="${escapeHtml(domain)}">Stop tracking this store</button>
      </div>
    </div>
  `;
}

async function renderAll() {
  const [merchants, records] = await Promise.all([getTrackedMerchants(), getBreachRecords()]);
  const targetDomain = targetDomainFromHash();

  const domains = Object.keys(merchants).sort((a, b) => {
    const ra = records[a]; const rb = records[b];
    const ca = (ra?.breaches || []).filter((x) => !x.dismissedAt).length;
    const cb = (rb?.breaches || []).filter((x) => !x.dismissedAt).length;
    if (ca !== cb) return cb - ca;
    return (merchants[b].lastSeen || 0) - (merchants[a].lastSeen || 0);
  });

  const totalActive = domains.reduce((sum, d) => sum + (records[d]?.breaches || []).filter((b) => !b.dismissedAt).length, 0);
  const lastScan = Math.max(0, ...domains.map((d) => records[d]?.lastCheckedAt || 0));

  document.getElementById('s-tracked').textContent = domains.length;
  document.getElementById('s-active').textContent = totalActive;
  document.getElementById('s-last').textContent = fmtTime(lastScan);

  const list = document.getElementById('merchants-list');
  if (domains.length === 0) {
    list.innerHTML = '<div class="empty">No stores tracked yet. Shop online with SafeCart installed and we’ll start tracking automatically.</div>';
    return;
  }
  list.innerHTML = domains.map((d) => renderMerchant(d, merchants[d], records[d])).join('');

  if (targetDomain) {
    const target = list.querySelector(`.merchant[data-domain="${CSS.escape(targetDomain)}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function sendMessage(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
      resolve(res || { ok: false });
    });
  });
}

document.addEventListener('click', async (e) => {
  const action = e.target?.dataset?.action;
  if (!action) return;
  const domain = e.target.dataset.domain;
  if (action === 'dismiss') {
    await sendMessage(MSG.BREACH_DISMISS, { domain, breachName: e.target.dataset.name });
    renderAll();
  } else if (action === 'untrack') {
    if (!confirm(`Stop tracking ${domain}? SafeCart will no longer check it for breaches.`)) return;
    await sendMessage(MSG.BREACH_UNTRACK, { domain });
    renderAll();
  }
});

document.getElementById('scan-now').addEventListener('click', async () => {
  const status = document.getElementById('scan-status');
  status.textContent = 'Scanning…';
  const res = await sendMessage(MSG.BREACH_SCAN_NOW, { forceAll: true });
  if (!res.ok) {
    status.textContent = `Scan failed: ${res.error || 'unknown'}`;
    return;
  }
  const s = res.summary || {};
  status.textContent = `Scanned ${s.checked || 0}, ${s.newBreaches || 0} new breach${s.newBreaches === 1 ? '' : 'es'}, ${s.errors?.length || 0} error${(s.errors?.length || 0) === 1 ? '' : 's'}.`;
  renderAll();
});

renderAll();
