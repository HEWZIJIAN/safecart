(() => {
  const MSG = {
    CHECKOUT_DETECTED: 'safecart/checkout-detected',
    USER_DISMISSED_WARNING: 'safecart/user-dismissed-warning',
  };
  const VERDICT = { SAFE: 'safe', SUSPICIOUS: 'suspicious', DANGEROUS: 'dangerous', UNKNOWN: 'unknown' };

  const CC_SELECTORS = [
    'input[autocomplete*="cc-number" i]',
    'input[autocomplete*="cardnumber" i]',
    'input[name*="card" i][type="text"]',
    'input[name*="card" i][type="tel"]',
    'input[name*="cardnumber" i]',
    'input[id*="card" i][type="text"]',
    'input[id*="card" i][type="tel"]',
    'input[id*="cardnumber" i]',
    'input[placeholder*="card number" i]',
    'input[aria-label*="card number" i]',
    'input[data-cy*="card" i]',
  ];

  const state = {
    requested: false,
    verdict: null,
    knownFields: new Set(),
  };

  function findCardFields() {
    const found = new Set();
    for (const selector of CC_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (el instanceof HTMLInputElement) found.add(el);
        });
      } catch {
        // invalid selector edge case — skip
      }
    }
    return [...found];
  }

  function preemptiveLock(fields) {
    if (!window.__SafeCart?.lockFields) return;
    window.__SafeCart.lockFields(fields);
  }

  function handleVerdict(verdict, fields) {
    state.verdict = verdict;

    if (!verdict || verdict.disabled) {
      window.__SafeCart?.unlockFields(fields);
      return;
    }

    if (verdict.userDismissed) {
      window.__SafeCart?.unlockFields(fields);
      return;
    }

    if (verdict.verdict === VERDICT.SAFE || verdict.verdict === VERDICT.UNKNOWN) {
      window.__SafeCart?.unlockFields(fields);
      return;
    }

    window.__SafeCart?.showWarning({
      verdict: verdict.verdict,
      hostname: verdict.hostname || location.hostname,
      reasons: verdict.reasons,
      safetyScore: verdict.safetyScore,
      fields,
      onProceed: () => {
        chrome.runtime.sendMessage({
          type: MSG.USER_DISMISSED_WARNING,
          payload: { hostname: verdict.hostname || location.hostname },
        });
      },
      onLeave: () => {
        try {
          window.location.href = 'about:blank';
        } catch {
          history.back();
        }
      },
    });
  }

  async function requestVerdict(fields) {
    if (state.requested) {
      if (state.verdict) handleVerdict(state.verdict, fields);
      return;
    }
    state.requested = true;
    preemptiveLock(fields);

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: MSG.CHECKOUT_DETECTED, payload: { url: location.href } },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(res || { ok: false });
          },
        );
      });

      if (!response?.ok) {
        window.__SafeCart?.unlockFields(fields);
        return;
      }
      handleVerdict(response.verdict, fields);
    } catch {
      window.__SafeCart?.unlockFields(fields);
    }
  }

  function scan() {
    const fields = findCardFields();
    const fresh = fields.filter((f) => !state.knownFields.has(f));
    if (fresh.length === 0) return;
    fresh.forEach((f) => state.knownFields.add(f));
    requestVerdict(fields);
  }

  function start() {
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['name', 'id', 'autocomplete', 'placeholder', 'type'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
