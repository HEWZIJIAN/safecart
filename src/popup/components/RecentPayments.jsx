import { useChromeMessage } from '../hooks/useChromeMessage.js';
import { MSG, PAYMENT_STATUS } from '../../lib/constants.js';

const STATUS_LABEL = {
  [PAYMENT_STATUS.PENDING]: 'Pending',
  [PAYMENT_STATUS.PAGE_CONFIRMED]: 'Confirmed',
  [PAYMENT_STATUS.EMAIL_CONFIRMED]: 'Confirmed',
  [PAYMENT_STATUS.USER_CONFIRMED]: 'Confirmed',
  [PAYMENT_STATUS.UNCONFIRMED]: 'No receipt',
  [PAYMENT_STATUS.DISMISSED]: 'Dismissed',
};

function fmtAmount(amount, currency) {
  if (amount == null) return '—';
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹' };
  const sym = symbols[currency] || '';
  return sym ? `${sym}${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency || ''}`.trim();
}

function fmtTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function openChargeback(id) {
  const url = chrome.runtime.getURL(`src/chargeback/chargeback.html#id=${encodeURIComponent(id)}`);
  chrome.tabs.create({ url });
}

export default function RecentPayments() {
  const { loading, data, error } = useChromeMessage(MSG.PAYMENT_LIST, { limit: 5 }, []);

  return (
    <section className="card">
      <h2 className="card__title">Recent payments</h2>
      {loading && <div className="muted">Loading…</div>}
      {error && <div className="muted">Could not load payments.</div>}
      {!loading && !error && (data?.payments?.length === 0 ? (
        <div className="muted">No payments tracked yet.</div>
      ) : (
        <ul className="payment-list">
          {data?.payments?.map((p) => {
            const statusKey = `status--${p.status}`;
            const showChargeback = p.status === PAYMENT_STATUS.UNCONFIRMED;
            return (
              <li key={p.id} className="payment">
                <div className="payment__main">
                  <div className="payment__merchant">{p.merchantName || p.merchantHost || 'Unknown'}</div>
                  <div className="payment__meta">{p.merchantHost} · {fmtTime(p.createdAt)}</div>
                  <span className={`badge ${statusKey}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                  {showChargeback && (
                    <button className="link-button" onClick={() => openChargeback(p.id)}>
                      Start chargeback →
                    </button>
                  )}
                </div>
                <div className="payment__amount">{fmtAmount(p.amount, p.currency)}</div>
              </li>
            );
          })}
        </ul>
      ))}
    </section>
  );
}
