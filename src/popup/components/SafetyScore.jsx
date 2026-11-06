import { useEffect, useState } from 'react';
import { sendMessage, useCurrentTab } from '../hooks/useChromeMessage.js';
import { MSG } from '../../lib/constants.js';
import { safetyMeta } from '../../lib/score.js';

// Circular safety-score ring. Arc length tracks the 0-100 score; color comes from
// the band class on the parent (.score--green/yellow/red/gray).
const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

function ScoreRing({ score }) {
  const hasScore = typeof score === 'number';
  const pct = hasScore ? Math.max(0, Math.min(100, score)) / 100 : 0;
  return (
    <div className="score__ring">
      <svg viewBox="0 0 46 46" width="46" height="46" aria-hidden="true">
        <circle className="score__ring-track" cx="23" cy="23" r={RING_R} fill="none" strokeWidth="5" />
        <circle
          className="score__ring-arc"
          cx="23"
          cy="23"
          r={RING_R}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - pct)}
          transform="rotate(-90 23 23)"
        />
      </svg>
      <span className="score__score">{hasScore ? score : '—'}</span>
    </div>
  );
}

function isCheckableUrl(url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export default function SafetyScore() {
  const tab = useCurrentTab();
  const [state, setState] = useState({ loading: true, verdict: null, error: null });

  useEffect(() => {
    if (!tab) return;
    if (!isCheckableUrl(tab.url)) {
      setState({ loading: false, verdict: null, error: 'not_applicable' });
      return;
    }
    let cancelled = false;
    sendMessage(MSG.REQUEST_VERDICT, { url: tab.url }).then((res) => {
      if (cancelled) return;
      if (res?.ok) setState({ loading: false, verdict: res.verdict, error: null });
      else setState({ loading: false, verdict: null, error: res?.error || 'unknown' });
    });
    return () => { cancelled = true; };
  }, [tab?.url]);

  const hostname = (() => {
    try { return tab?.url ? new URL(tab.url).hostname : ''; } catch { return ''; }
  })();

  if (state.error === 'not_applicable') {
    return (
      <section className="card score score--gray">
        <div className="score__badge" aria-hidden="true" />
        <div className="score__body">
          <div className="score__label">Not applicable</div>
          <div className="score__host">This isn't a web page SafeCart can score.</div>
        </div>
      </section>
    );
  }

  if (state.loading) {
    return (
      <section className="card score score--gray">
        <div className="score__badge" aria-hidden="true" />
        <div className="score__body">
          <div className="score__label">Scoring…</div>
          <div className="score__host">{hostname}</div>
        </div>
      </section>
    );
  }

  // 0-100 safety score (higher = safer). Color + label come straight from the
  // safety bands, so the ring color and the text label always match the score.
  const safetyScore = typeof state.verdict?.safetyScore === 'number' ? state.verdict.safetyScore : null;
  const meta = safetyMeta(safetyScore);
  const topReasons = (state.verdict?.reasons || []).slice(0, 2);

  return (
    <section
      className={`card score score--${meta.color}`}
      aria-label={`Safety ${safetyScore == null ? 'unknown' : `${safetyScore} out of 100`} — ${meta.label}`}
    >
      <ScoreRing score={safetyScore} />
      <div className="score__body">
        <div className="score__label">{meta.label}</div>
        <div className="score__host">{hostname || tab?.url || ''}</div>
        <div className="score__tone">{meta.tone}</div>
        {topReasons.length > 0 && (
          <ul className="score__reasons">
            {topReasons.map((r) => (
              <li key={r.code}>{r.detail || r.code}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
