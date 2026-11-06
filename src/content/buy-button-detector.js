(() => {
  const MSG = {
    PAYMENT_BUY_CLICKED: 'safecart/payment-buy-clicked',
    PAYMENT_CONFIRMATION_PAGE: 'safecart/payment-confirmation-page',
  };

  const BUY_PATTERNS = [
    /\bbuy now\b/i,
    /\bbuy\b/i,
    /\bplace (your )?order\b/i,
    /\bcomplete (your )?order\b/i,
    /\bconfirm (and )?(pay|order|purchase)\b/i,
    /\bsubmit (order|payment)\b/i,
    /\bpay\s?(now)?\b/i,
    /\bcheckout\b/i,
    /\bpurchase\b/i,
    /\bproceed to (pay|payment)\b/i,
    /\b完成订单\b|\b立即购买\b|\b支付\b/,
  ];

  const CARD_FIELD_SELECTORS = [
    'input[autocomplete*="cc-number" i]',
    'input[autocomplete*="cardnumber" i]',
    'input[name*="card" i]',
    'input[id*="card" i]',
    'input[placeholder*="card number" i]',
  ];

  const state = {
    fired: false,
    confirmationReported: false,
  };

  function hasCardField() {
    for (const sel of CARD_FIELD_SELECTORS) {
      try {
        if (document.querySelector(sel)) return true;
      } catch { /* skip */ }
    }
    return false;
  }

  function buttonLabel(el) {
    if (!el) return '';
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const text = (el.innerText || el.textContent || el.value || '').trim();
    return text;
  }

  function isBuyButton(target) {
    if (!target) return false;
    const el = target.closest?.('button, [role="button"], input[type="submit"], input[type="button"], a');
    if (!el) return false;
    const label = buttonLabel(el);
    if (!label || label.length > 60) return false;
    return BUY_PATTERNS.some((re) => re.test(label));
  }

  function send(type, payload) {
    try {
      chrome.runtime.sendMessage({ type, payload }, () => {
        if (chrome.runtime.lastError) { /* ignore — page may be unloading */ }
      });
    } catch { /* page unloading */ }
  }

  function onClick(event) {
    if (state.fired) return;
    const target = event.target;
    if (!isBuyButton(target)) return;
    if (!hasCardField()) return;

    const order = window.__SafeCart?.parseOrder?.();
    if (!order) return;

    state.fired = true;
    setTimeout(() => { state.fired = false; }, 5000);

    send(MSG.PAYMENT_BUY_CLICKED, {
      ...order,
      buttonLabel: buttonLabel(target.closest('button, [role="button"], input, a')),
      clickedAt: Date.now(),
    });
  }

  function checkConfirmationPage() {
    if (state.confirmationReported) return;
    if (!window.__SafeCart?.isConfirmationPage?.()) return;
    state.confirmationReported = true;
    const order = window.__SafeCart?.parseOrder?.();
    send(MSG.PAYMENT_CONFIRMATION_PAGE, {
      ...(order || {}),
      detectedAt: Date.now(),
      url: location.href,
      merchantHost: location.hostname.replace(/^www\./, ''),
    });
  }

  function start() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form && hasCardField()) {
        const submitter = e.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
        if (isBuyButton(submitter)) onClick({ target: submitter });
      }
    }, true);

    checkConfirmationPage();
    const observer = new MutationObserver(() => checkConfirmationPage());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
