(() => {
  const NS = (window.__SafeCart = window.__SafeCart || {});

  const TOTAL_KEYWORDS = [
    'order total', 'grand total', 'total amount', 'amount due',
    'amount to pay', 'total to pay', 'total payable', 'you pay',
    'order summary total', 'cart total', 'total',
  ];

  const CURRENCY_REGEX = /([\$€£¥₹₽₩฿]|USD|EUR|GBP|JPY|INR|AUD|CAD|SGD|MYR|HKD|CNY|KRW)\s?(\d{1,3}(?:[ ,. ]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[ ,. ]\d{3})*(?:[.,]\d{2}))\s?([\$€£¥₹₽₩฿]|USD|EUR|GBP|JPY|INR|AUD|CAD|SGD|MYR|HKD|CNY|KRW)/;

  function normalizeAmount(raw) {
    if (!raw) return null;
    let s = raw.replace(/[  ]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      const decimals = s.split(',').pop();
      s = decimals.length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function symbolToCurrency(sym) {
    const map = {
      '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
      '₹': 'INR', '₽': 'RUB', '₩': 'KRW', '฿': 'THB',
    };
    return map[sym] || sym;
  }

  function extractAmountFromText(text) {
    if (!text) return null;
    const match = CURRENCY_REGEX.exec(text);
    if (!match) return null;
    const symbol = match[1] || match[4];
    const number = match[2] || match[3];
    const amount = normalizeAmount(number);
    if (amount === null) return null;
    return { amount, currency: symbolToCurrency(symbol) };
  }

  function findTotalElement() {
    const all = document.querySelectorAll('body *');
    let best = null;
    for (const el of all) {
      if (el.children.length > 3) continue;
      const text = (el.textContent || '').trim();
      if (text.length === 0 || text.length > 200) continue;
      const lower = text.toLowerCase();
      const keywordMatch = TOTAL_KEYWORDS.find((k) => lower.includes(k));
      if (!keywordMatch) continue;
      const direct = extractAmountFromText(text);
      if (direct) {
        const specificity = TOTAL_KEYWORDS.indexOf(keywordMatch);
        if (!best || specificity < best.specificity) {
          best = { element: el, ...direct, specificity, source: 'inline' };
        }
        continue;
      }
      const neighbor = el.nextElementSibling || el.parentElement?.querySelector(':scope > :last-child');
      if (neighbor) {
        const fromNeighbor = extractAmountFromText(neighbor.textContent || '');
        if (fromNeighbor) {
          const specificity = TOTAL_KEYWORDS.indexOf(keywordMatch);
          if (!best || specificity < best.specificity) {
            best = { element: el, ...fromNeighbor, specificity, source: 'neighbor' };
          }
        }
      }
    }
    return best;
  }

  function findStructuredTotal() {
    const metas = document.querySelectorAll('[itemtype*="Order"] [itemprop="price"], [itemtype*="Order"] [itemprop="total"], meta[property="product:price:amount"]');
    for (const el of metas) {
      const raw = el.getAttribute('content') || el.textContent;
      const amount = normalizeAmount(raw);
      if (amount !== null) {
        const currencyEl = document.querySelector('[itemprop="priceCurrency"], meta[property="product:price:currency"]');
        const currency = currencyEl?.getAttribute('content') || currencyEl?.textContent || 'UNKNOWN';
        return { amount, currency, source: 'structured' };
      }
    }
    return null;
  }

  function findMerchantName() {
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    if (ogSite) return ogSite.trim();

    const appName = document.querySelector('meta[name="application-name"]')?.getAttribute('content');
    if (appName) return appName.trim();

    const schemaOrg = document.querySelector('[itemtype*="Organization"] [itemprop="name"]')?.textContent;
    if (schemaOrg) return schemaOrg.trim();

    const title = document.title;
    if (title) {
      const cleaned = title.split(/[|\-—–:]/)[0].trim();
      if (cleaned.length > 0 && cleaned.length < 60) return cleaned;
    }
    return null;
  }

  function parseOrder() {
    const structured = findStructuredTotal();
    const heuristic = findTotalElement();
    const total = structured || heuristic;
    const merchantName = findMerchantName();
    const merchantHost = location.hostname.replace(/^www\./, '');

    return {
      amount: total?.amount ?? null,
      currency: total?.currency ?? null,
      merchantName: merchantName || merchantHost,
      merchantHost,
      pageTitle: document.title || '',
      url: location.href,
      totalSource: total?.source || 'none',
    };
  }

  function isConfirmationPage() {
    const url = location.href.toLowerCase();
    const path = location.pathname.toLowerCase();
    const urlSignals = [
      'thank-you', 'thankyou', 'thanks',
      'order-confirmation', 'order-complete', 'order-placed', 'orderconfirmation',
      'receipt', 'success', 'order-success', 'confirmation',
    ];
    if (urlSignals.some((s) => path.includes(s) || url.includes(s))) return true;

    const bodyText = (document.body?.innerText || '').toLowerCase();
    const textSignals = [
      'thank you for your order', 'thanks for your order',
      'your order is confirmed', 'order confirmed', 'order has been placed',
      'order successful', 'payment successful', 'payment received',
    ];
    return textSignals.some((s) => bodyText.includes(s));
  }

  NS.parseOrder = parseOrder;
  NS.isConfirmationPage = isConfirmationPage;
  NS.extractAmountFromText = extractAmountFromText;
})();
