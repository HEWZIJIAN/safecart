(() => {
  const NS = (window.__SafeCart = window.__SafeCart || {});

  const VERDICT = { SAFE: 'safe', SUSPICIOUS: 'suspicious', DANGEROUS: 'dangerous', UNKNOWN: 'unknown' };
  const OVERLAY_ID = 'safecart-overlay-root';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();
  }

  function lockFields(fields) {
    for (const field of fields) {
      field.classList.add('safecart-field-locked');
      field.setAttribute('readonly', 'true');
      field.setAttribute('aria-disabled', 'true');
      field.dataset.safecartLocked = '1';
    }
  }

  function unlockFields(fields) {
    for (const field of fields) {
      field.classList.remove('safecart-field-locked');
      field.removeAttribute('readonly');
      field.removeAttribute('aria-disabled');
      delete field.dataset.safecartLocked;
    }
  }

  function showWarning({ verdict, hostname, reasons, safetyScore, fields, onProceed, onLeave }) {
    removeOverlay();
    lockFields(fields);

    const isDangerous = verdict === VERDICT.DANGEROUS;
    const headerClass = isDangerous ? '' : 'safecart-suspicious';
    const title = isDangerous ? 'Stop — this site looks dangerous' : 'Caution — this site looks suspicious';
    const subtitle = isDangerous
      ? 'SafeCart blocked the payment fields. Do not enter your card.'
      : 'SafeCart found warning signs before you enter your card.';

    const reasonsHtml = (reasons || [])
      .slice(0, 6)
      .map((r) => `<li>${escapeHtml(r.detail || r.code)}</li>`)
      .join('');

    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.innerHTML = `
      <div class="safecart-backdrop" role="dialog" aria-modal="true" aria-labelledby="safecart-title">
        <div class="safecart-modal">
          <div class="safecart-header ${headerClass}">
            <div class="safecart-header-icon">${isDangerous ? '⚠' : '⚡'}</div>
            <div>
              <h2 id="safecart-title" class="safecart-header-title">${escapeHtml(title)}</h2>
              <div class="safecart-header-sub">${escapeHtml(subtitle)}</div>
            </div>
          </div>
          <div class="safecart-body">
            <p>You are on <span class="safecart-host">${escapeHtml(hostname || 'this site')}</span>.</p>
            <p>SafeCart found the following issues:</p>
            <ul class="safecart-reasons">${reasonsHtml || '<li>Multiple risk signals detected.</li>'}</ul>
            <div class="safecart-score">Safety score: ${escapeHtml(String(safetyScore ?? '?'))} / 100</div>
          </div>
          <div class="safecart-actions">
            <button class="safecart-btn safecart-btn-secondary" data-action="proceed">I trust this site</button>
            <button class="safecart-btn safecart-btn-primary" data-action="leave">Leave site</button>
          </div>
        </div>
      </div>
    `;

    root.querySelector('[data-action="leave"]').addEventListener('click', () => {
      removeOverlay();
      if (typeof onLeave === 'function') onLeave();
    });
    root.querySelector('[data-action="proceed"]').addEventListener('click', () => {
      removeOverlay();
      unlockFields(fields);
      if (typeof onProceed === 'function') onProceed();
    });

    (document.body || document.documentElement).appendChild(root);
  }

  NS.showWarning = showWarning;
  NS.removeOverlay = removeOverlay;
  NS.lockFields = lockFields;
  NS.unlockFields = unlockFields;
})();
