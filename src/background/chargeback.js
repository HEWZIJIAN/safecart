let supportData = null;

async function loadSupport() {
  if (supportData) return supportData;
  const response = await fetch(chrome.runtime.getURL('src/data/merchant-support.json'));
  supportData = await response.json();
  return supportData;
}

export async function getSupportFor(merchantHost) {
  const data = await loadSupport();
  if (!merchantHost) return { ...data.fallback, isFallback: true };
  const direct = data.merchants[merchantHost];
  if (direct) return { ...direct, isFallback: false };
  const parts = merchantHost.split('.');
  const eTld = parts.slice(-2).join('.');
  const fuzzy = data.merchants[eTld];
  if (fuzzy) return { ...fuzzy, isFallback: false };
  return { ...data.fallback, isFallback: true };
}

function formatAmount(amount, currency) {
  if (amount == null) return 'an unrecognized amount';
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };
  const sym = symbols[currency] || '';
  const formatted = amount.toFixed(2);
  return sym ? `${sym}${formatted}` : `${formatted} ${currency || ''}`.trim();
}

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

export function generateTemplate(payment, support) {
  const amountStr = formatAmount(payment.amount, payment.currency);
  const merchant = payment.merchantName || payment.merchantHost || 'the merchant';
  const dateStr = formatDate(payment.createdAt);

  return `Subject: Disputed transaction — no order confirmation received

To whom it may concern,

On ${dateStr} I was charged ${amountStr} via ${merchant} (${payment.merchantHost || 'website unknown'}). I have not received any order confirmation, receipt, or shipping notification from this merchant.

Transaction details:
  • Merchant: ${merchant}
  • Website: ${payment.url || payment.merchantHost || 'n/a'}
  • Amount: ${amountStr}
  • Date/time of charge attempt: ${dateStr}

I am requesting the following:
  1. Confirmation of whether this charge was completed and a copy of the receipt.
  2. If the charge was completed but no goods/services were delivered, please cancel the order and refund in full.
  3. If you cannot locate this transaction, please confirm so in writing so I can dispute the charge with my card issuer.

I have already filed a record with my browser/payment-tracking tool at the time of the transaction.

Thank you,
[Your name]
[Your contact email]
[Last 4 digits of card used — DO NOT include the full card number]
`;
}

export function generateBankDisputeSummary(payment) {
  const amountStr = formatAmount(payment.amount, payment.currency);
  const dateStr = formatDate(payment.createdAt);
  return `Chargeback summary for your card issuer:

  • Date of transaction: ${dateStr}
  • Amount: ${amountStr}
  • Merchant (as displayed at checkout): ${payment.merchantName || 'n/a'}
  • Website: ${payment.url || payment.merchantHost || 'n/a'}
  • Reason: Goods/services not received — no order confirmation issued by merchant within 30 minutes.
  • Prior contact attempt with merchant: see attached email template.
`;
}
