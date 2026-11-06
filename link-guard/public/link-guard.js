/*!
 * link-guard.js — pre-click link verification (frontend interceptor)
 * Framework-agnostic, zero dependencies. Progressive enhancement: with JS off,
 * links work normally. With it on, external links are scanned before navigation.
 *
 * Usage (auto):
 *   <link rel="stylesheet" href="/link-guard.css">
 *   <script src="/link-guard.js" data-auto data-endpoint="/api/scan"></script>
 *
 * Usage (manual):
 *   const guard = LinkGuard.create({ endpoint: '/api/scan' });
 *   guard.attach();                       // whole document
 *   guard.attach(document.querySelector('#content'));
 *
 * Opt a link OUT with: <a href="…" data-lg-ignore>…</a>
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    endpoint: '/api/scan',
    hoverDelayMs: 180,    // hover at least this long → pre-scan (warm the cache)
    scanTimeoutMs: 3500,  // give up waiting on the backend after this
    failOpen: true,       // on error/timeout: allow navigation (false → warn instead)
    warnOn: ['malicious', 'suspicious'], // verdicts that pop the modal
    clientCacheMs: 5 * 60 * 1000,        // remember a verdict this long in the tab
  };

  function isExternal(a) {
    try { return new URL(a.href).origin !== location.origin; }
    catch (_) { return false; }
  }
  function wantsNewContext(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  }
  function hostOf(u) { try { return new URL(u).host; } catch (_) { return u || ''; } }

  function createGuard(userOpts) {
    var opts = Object.assign({}, DEFAULTS, userOpts || {});
    var cache = new Map();    // href -> { result, at }
    var inflight = new Map(); // href -> Promise

    // --- backend call (deduped + client-cached) ------------------------------
    function scan(href) {
      var hit = cache.get(href);
      if (hit && Date.now() - hit.at < opts.clientCacheMs) return Promise.resolve(hit.result);
      if (inflight.has(href)) return inflight.get(href);

      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, opts.scanTimeoutMs);

      var p = fetch(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: href }),
        signal: ctrl.signal,
        credentials: 'omit',
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('scan_' + r.status)); })
        .then(function (result) { cache.set(href, { result: result, at: Date.now() }); return result; })
        .catch(function (err) { return { threat: 'unknown', url: href, error: String(err) }; })
        .then(function (result) { clearTimeout(timer); inflight.delete(href); return result; });

      inflight.set(href, p);
      return p;
    }

    // --- UI: subtle "Checking link…" chip ------------------------------------
    var chip, chipCount = 0;
    function showChip() {
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'lg-chip';
        chip.setAttribute('role', 'status');
        chip.innerHTML = '<span class="lg-spinner" aria-hidden="true"></span><span>Checking link…</span>';
        document.body.appendChild(chip);
      }
      chipCount++;
      chip.classList.add('lg-show');
    }
    function hideChip() {
      chipCount = Math.max(0, chipCount - 1);
      if (chip && chipCount === 0) chip.classList.remove('lg-show');
    }

    // --- UI: warning modal ---------------------------------------------------
    // IMPORTANT: every dynamic value (host, sources) is set via textContent, so a
    // hostile URL/host string can never inject HTML into our own page.
    function showWarning(result, proceed) {
      var lastFocus = document.activeElement;
      var overlay = document.createElement('div');
      overlay.className = 'lg-overlay';

      var card = document.createElement('div');
      card.className = 'lg-modal' + (result.threat === 'malicious' ? ' lg-danger' : '');
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'lg-title');
      card.setAttribute('aria-describedby', 'lg-msg');

      var title = document.createElement('h2');
      title.id = 'lg-title';
      title.className = 'lg-h';
      title.textContent =
        result.threat === 'malicious' ? '⛔ Dangerous link' :
        result.threat === 'suspicious' ? '⚠️ Suspicious link' : '❓ Couldn’t verify this link';

      var host = document.createElement('p');
      host.className = 'lg-host';
      host.textContent = hostOf(result.url);

      var msg = document.createElement('p');
      msg.id = 'lg-msg';
      msg.className = 'lg-msg';
      msg.textContent =
        result.threat === 'malicious'
          ? 'Our scanner flagged this destination as malicious (phishing or malware). We strongly recommend not visiting it.'
          : result.threat === 'suspicious'
          ? 'This destination shows scam or phishing warning signs. Continue only if you’re sure you trust it.'
          : 'We couldn’t reach our scanner to verify this link. Proceed with caution.';

      var row = document.createElement('div');
      row.className = 'lg-row';
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'lg-btn lg-primary';
      back.textContent = 'Go back (recommended)';
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'lg-btn lg-ghost';
      go.textContent = 'Visit anyway';
      row.appendChild(back);
      row.appendChild(go);

      card.appendChild(title);
      card.appendChild(host);
      card.appendChild(msg);
      card.appendChild(row);

      if (result.sources && result.sources.length) {
        var src = document.createElement('p');
        src.className = 'lg-src';
        src.textContent = 'Detected by: ' + result.sources.join(', ');
        card.appendChild(src);
      }

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') { // simple focus trap between the two buttons
          var f = [back, go];
          var i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
      back.addEventListener('click', close);
      go.addEventListener('click', function () { close(); proceed(); });
      back.focus();
    }

    // --- navigation, preserving the user's intent ----------------------------
    function navigate(a, e) {
      if (a.target === '_blank' || (e && wantsNewContext(e))) {
        window.open(a.href, '_blank', 'noopener');
      } else {
        location.href = a.href;
      }
    }

    function decide(a, e, result) {
      var verdict = result && result.threat;
      if (opts.warnOn.indexOf(verdict) !== -1) return showWarning(result, function () { navigate(a, e); });
      if (verdict === 'unknown' && !opts.failOpen) return showWarning(result, function () { navigate(a, e); });
      navigate(a, e); // safe, or fail-open on 'unknown'
    }

    // --- event handlers ------------------------------------------------------
    function onClick(e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.dataset.lgIgnore !== undefined || !isExternal(a)) return;
      if (e.defaultPrevented || e.button !== 0) return; // let the browser handle non-primary

      e.preventDefault(); // hold navigation until we have a verdict
      showChip();
      scan(a.href).then(function (result) {
        hideChip();
        decide(a, e, result);
      });
    }

    function onHover(e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || a.dataset.lgIgnore !== undefined || !isExternal(a)) return;
      var t = setTimeout(function () { scan(a.href); }, opts.hoverDelayMs); // warm cache
      a.addEventListener('mouseleave', function () { clearTimeout(t); }, { once: true });
    }

    function attach(root) {
      root = root || document;
      // Capture phase so we run before site-level click handlers / framework routers.
      root.addEventListener('click', onClick, true);
      root.addEventListener('mouseover', onHover, true);
      return api;
    }
    function detach(root) {
      root = root || document;
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('mouseover', onHover, true);
      return api;
    }

    var api = { attach: attach, detach: detach, scan: scan, options: opts };
    return api;
  }

  var LinkGuard = { create: createGuard };
  if (typeof module !== 'undefined' && module.exports) module.exports = LinkGuard;
  else global.LinkGuard = LinkGuard;

  // Auto-init when the tag has a `data-auto` attribute.
  if (typeof document !== 'undefined' && document.currentScript) {
    var cur = document.currentScript;
    if (cur.dataset.auto !== undefined) {
      var g = createGuard({ endpoint: cur.dataset.endpoint || undefined });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { g.attach(); });
      else g.attach();
      global.__linkGuard = g;
    }
  }
})(typeof window !== 'undefined' ? window : this);
