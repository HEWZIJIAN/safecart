import { getPayment } from '../background/storage.js';
import { getSupportFor, generateTemplate, generateBankDisputeSummary } from '../background/chargeback.js';
import { MSG, PAYMENT_STATUS } from '../lib/constants.js';

function paymentIdFromHash() {
  const hash = location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  return params.get('id');
}

function fmtAmount(amount, currency) {
  if (amount == null) return '—';
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };
  const sym = symbols[currency] || '';
  return sym ? `${sym}${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency || ''}`.trim();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderSupport(support) {
  const block = document.getElementById('support-block');
  if (!support) { block.textContent = 'No support contacts available.'; return; }
  if (support.isFallback) {
    block.innerHTML = `<p>${support.instructions}</p><p><a class="secondary-link" href="${support.url}" target="_blank" rel="noopener">Consumer guide to chargebacks →</a></p>`;
    return;
  }
  const rows = [];
  if (support.name) rows.push(`<div class="support-line"><span class="label">Name</span><span>${support.name}</span></div>`);
  if (support.phone) rows.push(`<div class="support-line"><span class="label">Phone</span><a href="tel:${support.phone}">${support.phone}</a></div>`);
  if (support.email) rows.push(`<div class="support-line"><span class="label">Email</span><a href="mailto:${support.email}">${support.email}</a></div>`);
  if (support.url) rows.push(`<div class="support-line"><span class="label">Help page</span><a href="${support.url}" target="_blank" rel="noopener">${support.url}</a></div>`);
  block.innerHTML = rows.join('') || 'No support contacts available.';
}

function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function init() {
  const id = paymentIdFromHash();
  if (!id) {
    setText('sub', 'No payment specified.');
    return;
  }
  const payment = await getPayment(id);
  if (!payment) {
    setText('sub', 'Payment record not found. It may have been cleared.');
    return;
  }

  setText('p-merchant', payment.merchantName || payment.merchantHost || '—');
  setText('p-url', payment.url || payment.merchantHost || '—');
  setText('p-amount', fmtAmount(payment.amount, payment.currency));
  setText('p-when', new Date(payment.createdAt).toLocaleString());
  setText('p-status', payment.status);

  const support = await getSupportFor(payment.merchantHost);
  renderSupport(support);

  const emailTemplate = generateTemplate(payment, support);
  const bankTemplate = generateBankDisputeSummary(payment);
  document.getElementById('template').value = emailTemplate;
  document.getElementById('bank-template').value = bankTemplate;
  document.getElementById('cfpb-link').href = support.url && support.isFallback
    ? support.url
    : 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-chargeback-en-1497/';

  document.getElementById('copy-template').addEventListener('click', async () => {
    const ok = await copyToClipboard(emailTemplate);
    toast(ok ? 'Template copied to clipboard' : 'Copy failed — select and copy manually');
  });
  document.getElementById('copy-bank').addEventListener('click', async () => {
    const ok = await copyToClipboard(bankTemplate);
    toast(ok ? 'Bank summary copied' : 'Copy failed — select and copy manually');
  });

  document.getElementById('mailto').addEventListener('click', () => {
    const to = support.email || '';
    const subject = encodeURIComponent('Disputed transaction — no order confirmation received');
    const body = encodeURIComponent(emailTemplate);
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  });

  document.getElementById('mark-confirmed').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: MSG.PAYMENT_MARK_CONFIRMED, payload: { id } }, () => {
      toast('Marked as confirmed');
      setTimeout(() => window.close(), 800);
    });
  });
}

init();
