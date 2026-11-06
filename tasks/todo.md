# SafeCart — Website Redesign

Goal: replace the basic Carrd page (safecart0611.carrd.co) with a polished, custom-coded
marketing site that matches the extension's brand and converts installs.

## Plan
- [x] Pull accurate product facts from the repo (features, pricing, privacy, links)
- [x] Build a single self-contained `website/index.html` (no build step, deploy-anywhere)
  - [x] Sticky translucent nav + mobile menu
  - [x] Hero with animated browser/phishing-warning mockup + dual CTA
  - [x] Trust bar (Safe Browsing, PhishTank, HIBP, RDAP, Stripe)
  - [x] Problem framing section
  - [x] 3 alternating feature blocks (Phishing / Payments / Breaches) with mock UI
  - [x] How it works (3 steps)
  - [x] Demo video (Loom embed)
  - [x] Pricing (Free / Premium $2.49 / Family $4.99)
  - [x] "Privacy you can verify" section
  - [x] FAQ (accessible <details> accordion)
  - [x] Final CTA + waitlist email capture
  - [x] Footer
  - [x] SEO + Open Graph + Twitter meta, inline SVG favicon/logo
  - [x] GA4 (G-ECGP0XNK7C)
  - [x] Scroll-reveal, reduced-motion safe, responsive
- [ ] User fills 1 config line (Chrome Web Store URL) + optional waitlist endpoint
- [ ] Deploy (GitHub Pages or Cloudflare Pages) and point domain

## Things only the user can supply (marked in the file)
- `CHROME_STORE_URL` — the live Chrome Web Store detail link (in <script> CONFIG block)
- `WAITLIST_ENDPOINT` — optional Tally/Formspree URL to collect emails (else demo mode)
- `og:image` absolute URL — reuse the Carrd OG image once hosted

## Review

Built `website/index.html` — a single, self-contained, dependency-free landing page
(no build step). Verified in a headless browser at mobile + 1280px desktop:

- Hero: two-column (545px/493px), gradient headline, animated browser mockup with the
  red phishing-warning modal + floating "Payment tracked"/"Breach alert" cards. ✓
- Trust bar, 3 problem cards, 3 alternating feature blocks with mock UI cards. ✓
- Pricing 3-up (Free / Premium $2.49 "Most popular" / Family $4.99). ✓
- Privacy ("verify it yourself" 4 points), FAQ accordion (native <details>, working). ✓
- 7 "Add to Chrome" buttons all wired to CHROME_STORE_URL, open in new tab. ✓
- Loom demo embed (a21d2005…), GA4 (G-ECGP0XNK7C), dynamic footer year. ✓
- Responsive: 3-col grids collapse to 1-col under 780px; mobile hamburger menu. ✓
- Zero console errors/warnings. Reduced-motion safe. Reveal animations have JS fallbacks.

Preview server: `.claude/preview-server.cjs` (zero-dep Node static server) + `.claude/launch.json`.
Live at http://localhost:4178 while the session is open.

### Polish tweaks (applied + verified)
- [x] Dismissible "🎉 SafeCart is now live on the Chrome Web Store — install free →" top banner.
      Wired to CHROME_STORE_URL (`.js-install`), dismiss persists via `localStorage.sc_banner_dismissed`.
- [x] Footer line → "Built solo · An indie project · Privacy-first".
      Verified at 1280px: banner renders, dismiss hides + persists (ls=1), footer line present,
      install buttons now 8 (7 + banner link). Zero console errors.

### Deploy (DONE)
- [x] Deployed to Cloudflare Workers static assets (drag-and-drop "Upload your static files").
      LIVE URL: https://morning-scene-398e.safecart-hzj.workers.dev
      (Cloudflare auto-named the project "morning-scene-398e" — the upload flow didn't prompt
      for a name. Functional but not brandable. Future: attach a custom domain for a clean URL.)
- [x] Verified live via WebFetch: title, hero, $2.49/$4.99 pricing, FAQ all render, zero errors.
- [x] Updated canonical + og:url in local index.html → live workers.dev URL (staged for next upload).
- [~] og:image still points to Carrd CDN (https://safecart0611.carrd.co/assets/images/og.png).
      Left intentionally — it still resolves and user keeps Carrd Pro, so it hosts the OG image for free.

- [x] Wired real Chrome Web Store URL into CONFIG:
      https://chromewebstore.google.com/detail/safecart/cljpoelnlljioahkhgiplbbgkacebech
      Verified in preview: all 8 .js-install els + banner now resolve to it, target=_blank, rel=noopener.

- [x] Re-uploaded index.html via "New deployment" — store link + corrected tags are LIVE.
      Verified by fetching the live URL (cache-busted): status 200, real extension ID present,
      workers.dev canonical present, old search-fallback gone, old Carrd canonical gone.

SITE IS LIVE: https://safecart.co  (custom domain, HTTPS active — verified 200 + content)
  Also reachable at the original https://morning-scene-398e.safecart-hzj.workers.dev

- [x] Bought safecart.co via Cloudflare Registrar ($26/yr) + connected as Worker Custom Domain (root). HTTPS auto-provisioned.
- [x] Re-pointed canonical + og:url → https://safecart.co/, re-uploaded, and VERIFIED LIVE
      (canonical + og:url now safecart.co, zero workers.dev refs left, store link intact, HTTPS 200).
      PROJECT COMPLETE — custom site built, deployed, real store link wired, domain bought + connected + secured.

Optional future upgrades (nothing broken without them):
- [x] Wired WAITLIST_ENDPOINT → Formspree (https://formspree.io/f/xjgzdkkv) and DEPLOYED. DONE.
      Footer email box now POSTs real sign-ups to the user's Formspree dashboard. Fully verified:
      - Direct POST of the exact site payload → 200 {"ok":true}.
      - Live safecart.co re-uploaded + fetched (cache-busted): hasFormspreeEndpoint=true,
        stillDemoMode=false, status 200, store link + safecart.co canonical still intact.
      - First real sign-up captured in the "SafeCart waitlist" Inbox (green check); test entry deleted.
      Manage/export sign-ups: formspree.io → SafeCart waitlist → Submissions → Export (CSV).
- [x] Self-host the OG image (kill the Carrd dependency). IMPORTANT: discovered the old og:image URL
      (carrd.co/.../og.png) was already 404 — link previews had no image. Generated a fresh, on-brand
      1200x630 og.png matching the new site (#0b0a1e bg + violet glow, gradient shield+check logo, bold
      wordmark, "Your shopping safety net" + benefit bullets, gradient "Free Chrome extension" pill) via
      a self-contained GDI+ script (.claude/make-og.ps1 — no new deps; viewed + iterated to fix a U+00B7
      encoding artifact). Saved website/og.png (108 KB, valid 1200x630 PNG). Rewrote index.html social
      tags: og:image -> https://safecart.co/og.png + og:image:type/width/height/alt, added explicit
      twitter:image + alt, removed the TODO comment and the stale Carrd URL. Grep confirms ZERO carrd
      refs remain. DEPLOYED + VERIFIED LIVE: safecart.co/og.png = 200 image/png 1200x630, byte-identical
      to local (SHA-256 match); page og:image + twitter:image both resolve; canonical safecart.co; live
      HTML contains 'carrd' = False; store link intact. Site is now 100% self-contained — Carrd Pro can be
      cancelled (only the old safecart0611.carrd.co page is lost; nothing in the product depends on it).


## Popup redesign — port to extension

Approved a cleaner, more professional popup redesign (dark indigo/violet theme matching
safecart.co, gold upgrade button killed) + professional Inter typography. Iterated in a live
preview (website/_popup-preview.html on :4180) until the user approved. Porting preview → real source:

- [x] Bundle Inter locally (src/popup/fonts/inter-variable.woff2 + @font-face) — NO remote fonts (privacy + offline)
- [x] Rewrite src/popup/styles.css with the dark theme + Inter typography
- [x] App.jsx: shield-logo brand lockup + "Checkout protection" tagline (replaces bare <h1>)
- [x] UpgradeButton.jsx: Premium "Popular" featured tag (plan--featured + plan__tag)
- [x] npm run build → dist/popup rebuilt in 511ms, zero errors. Verified in built output:
      inter-variable-Dx4kXJAl.woff2 (48 kB) emitted; @font-face src=./inter-variable-…woff2 (relative,
      resolves in-extension, no CSP issue); CSS has dark tokens + 3 tabular-nums; JS has brand__name/tag,
      "Checkout protection", "Popular", plan--featured.
- [x] Corner-rounding saga — RESOLVED as a clean dark RECTANGLE (no rounding). Chrome draws the popup as
      a square, opaque window that CSS/manifest cannot reshape. Attempt A (.app border-radius:18px +
      overflow:hidden) left dark square notches at the bottom against light pages. Attempt B (white window
      backing so corners blend on light pages) showed ugly white empty corners — user confirmed via
      screenshot it "looked pretty unprofessional." FINAL: fill the window edge-to-edge with the dark
      theme (html{background:var(--bg-0)}, body{radial-gradient + var(--bg-0)}, .app no radius/overflow).
      Rebuilt (465ms) + verified in dist CSS (index-BSoxBuv1.css): html dark, body dark gradient, .app has
      no border-radius/overflow/white. NOTE: popup *position* under the toolbar is also Chrome-controlled.
- [ ] User reloads extension in chrome://extensions to see it (runtime render needs the extension context)
- [x] Cleanup preview sandbox — DONE. Deleted website/_popup-preview.html + .claude/popup-preview-server.cjs,
      removed the "popup-preview" entry from .claude/launch.json (kept "safecart-site" :4178), and stopped the
      :4180 server (PID 42976 / bg b0i3vd9j7). Grep confirms no dangling source references remain.


## Demo film — replaced the low-effort Loom embed with a built-in animated film

Goal (user): make the "Watch 60-sec demo" feel premium like Anthropic's "Introducing Cowork"
launch film — calm, kinetic typography, real UI in clean frames — with an AI voiceover
(user will NOT record their own voice; I pick the best-suited voice).

- [x] Built a self-contained animated film INSIDE index.html (no video file, no new deps). Replaced the
      Loom <iframe> (#demo) with a 6-scene "film" that reuses the site's real UI components:
      S1 Title (shield logo + "SafeCart" wordmark) → S2 Phishing (browser mock + red .warn modal pop) →
      S3 Payments (feat-card + 3 pay-rows rise in) → S4 Breach (breach-box) → S5 Privacy (kinetic line +
      3 chips) → S6 CTA (logo + "Add to Chrome — free" button). Kinetic typography: each headline is
      split into word <span>s that blur-rise in, staggered by --i.
- [x] Playback engine (vanilla JS, ~70 lines): play-poster overlay (autoplay-policy safe) → on click,
      scenes crossfade on a timeline. Progress bar + chapter label ("3 / 6 · Payment tracking") + replay
      end-card. Reduced-motion safe (words/visuals forced visible, no transitions). gtag('demo_play').
- [x] OPTIONAL VOICEOVER — true drop-in. <audio id="demoVO"><source src="demo-vo.mp3"></audio> sits in the
      frame. If website/demo-vo.mp3 exists: auto-detected (canplaythrough → .has-audio), it becomes the
      master clock (audio.currentTime drives scenes via rAF), sound plays, mute button + "🔊 with voiceover"
      poster text appear. If absent (404): silent captioned fallback on a performance.now() timer — same film.
      ELEGANCE: when audio is present, scene cues are SCALED to audio.duration (cueAt = start*dur/53), so the
      captions stay in sync for ANY voiceover length, not just ~52s.
- [x] Verified in headless preview (localhost:4178) at desktop/tablet/mobile via DOM geometry + state probes
      (the preview renders the tab as document.hidden, so rAF/compositor are paused there — can't screenshot
      motion, but layout + logic verified):
      - 6 scenes, 35 kinetic word-spans split correctly. Zero console errors/warnings.
      - No clipping at desktop (frame 980×551), tablet (705×397, side-by-side), mobile (327×624, stacked) —
        fixed an initial mobile overflow (split scenes 524–541px were clipped by a 480px frame → min-height 624).
      - Play path: poster click → .playing, scene 0 active, cc "1/6 · Intro", poster pointer-events:none instantly.
      - End state: .ended → replay card display:flex; both in-film .js-install CTAs wired to the real store URL
        (chromewebstore.../cljpoelnlljioahkhgiplbbgkacebech), target=_blank.
      - No-audio fallback correctly gated: .has-audio false, mute hidden, poster shows "Captioned" copy.
- [x] Voiceover generated (ElevenLabs "Brian", calm narration) + saved as website/demo-vo.mp3 (799 KB, 48.9s).
      Caught + fixed a user gotcha: the [timecode · label] markers in the script must NOT be pasted into the
      TTS box (the AI would read them aloud) — gave the clean narration-only text.
      Verified locally (localhost:4178): valid MP3 (ID3 header), film auto-detects it (readyState 4, duration
      48.9s, error null → .has-audio, mute button + "🔊 with voiceover" poster), and the audio decodes + PLAYS
      (currentTime advances). Cue-scaling stretches the 6 scenes to 48.9s so captions stay in sync.
- [x] PACING — made the film swifter/snappier per feedback ("animation more swifty and active", "transition
      is really slow, bump it faster"). Scene crossfade .7s → opacity .38s / transform .42s (snappier bezier);
      kinetic words .6s→.42s, stagger 70ms→42ms; sub fade .7s→.48s; rise .7s→.48s; warn pop .6s/.75s-delay →
      .46s/.5s; poster fade .5s→.35s; and tightened every inline per-scene --subdelay/--d so content lands
      sooner. Scene START cues (0/6/17/28/39/46.5) are UNCHANGED — they stay locked to the 48.9s voiceover via
      cue-scaling, so audio sync is preserved. Verified live (localhost:4178): getComputedStyle confirms scene
      transition 0.38s/0.42s and wordIn 0.42s; page readyState complete, zero console errors.
- [x] BACKGROUND MUSIC — true drop-in, mirrors the voiceover pattern. <audio id="demoMusic" loop> in the frame;
      auto-detected (canplaythrough → haveMusic + .has-audio), plays in parallel UNDER the voice at volume 0.16,
      fades in 700ms on play and out 450ms on finish (a fade() helper ramps volume so it never cuts hard). The
      mute button now mutes voice + music together (single .muted source of truth). Graceful if absent — verified
      with no file present: networkState 3 (404), haveMusic stays false, demo plays normally, no JS errors.
- [x] MUSIC FILE IN PLACE — user downloaded it but Windows stripped the "/" so it saved as
      Downloads\websitedemo-music.mp3 (path vs filename confusion). Copied it to website\demo-music.mp3
      (3.1 MB, valid MPEG frame-sync FF FB). Verified live (localhost:4178): server serves /demo-music.mp3
      (200), the film loads it (currentSrc set, readyState 4, error null → haveMusic true, .has-audio + mute
      visible), zero console errors.
- [x] AUDIO SYNC + VOLUME tweak (user feedback): the 700ms music fade-IN made the bed sound like it came in
      late. Removed the fade-in — music now starts at full bed level the instant play fires, landing together
      with the voice (added a guard to cancel any in-flight fade-out on rapid replay). Lowered MUSIC_VOL
      0.16 → 0.10 (10%). Fade-OUT on finish kept (450ms) so the tail still ends gracefully with the voice.
      Verified live: page complete, both mp3s readyState 4 / error null, zero console errors. (True beat-matching
      of the two recordings isn't a code lever — if the track itself doesn't groove with the narration, swap the
      track; the simultaneous start + soft bed is what makes the full audio sit in pocket.)
- [x] ROUND 2 tweaks (user): music 0.10 → 0.08 (read "0.8" as 0.08 = trim down, since 0.8/80% would be louder).
      Voiceover sped up via audio.playbackRate = 1.1 (dialed from 1.12) with preservesPitch=true (no re-record, no chipmunk) —
      VO_RATE constant. Sync still holds: the timeline is driven by audio.currentTime (narration POSITION), so
      scenes hit the same narration beats; the demo just finishes faster in wall-clock. Verified live: browser
      supports playbackRate (1.12 accepted) + preservesPitch (true), both mp3s readyState 4, zero console errors.
- [x] ROUND 3 — "music feels late vs the voice." Diagnosed objectively (decoded the mp3 via Web Audio in the
      preview): NOT a code fade — the TRACK has a soft ~1s swell intro (first 500ms RMS = 0.022 vs whole 0.307;
      reaches 25% energy @0.7s, 50% @1.0s). Fix: start music at an offset past the swell (MUSIC_START = 0.9s) so
      the bed is present from the first word, AND start the music block BEFORE the voice block in start() so
      call-order/latency can't make it lag. Verified live: seek lands instantly (fully buffered), zero console
      errors. Tunable by ear via MUSIC_START — dialed 0.9 → 0.6 for a gentler entrance (enters during the softer
      part of the swell, ~24% energy vs ~49% at 0.9, still present at once with no fade/delay).
- [x] USER APPROVED — "good to go." Final demo settings: MUSIC_VOL 0.08, VO_RATE 1.1, MUSIC_START 0.6,
      music fades out 450ms on finish. website/ holds all 4 deploy files: index.html, demo-vo.mp3,
      demo-music.mp3, og.png.
- [x] DEPLOYED + VERIFIED LIVE (2026-05-31). Key discovery: safecart.co is NOT Cloudflare Pages — it's a
      static-assets Worker `morning-scene-398e` (auto-named; originally a dashboard "Upload static files")
      under account 6887…, with safecart.co attached as a Worker Custom Domain. Inspected it via the CF API
      first (has_assets:true, has_modules:false, bindings:[], compat 2026-05-31) to confirm it's assets-only and
      see the domain binding, THEN redeployed all 4 files with `wrangler deploy` using a new repo-root config
      `wrangler-site.toml` that mirrors the worker (name + compat date + [assets] directory=website, and NO
      routes, so the safecart.co binding is left untouched). VERIFIED: safecart.co = 200, 85,683 B (the music
      build, +2.6 KB over the old 83,067); live HTML now has demo-music.mp3 + id="demoMusic"; /demo-music.mp3 =
      200 audio/mpeg 3,192,372 B; /demo-vo.mp3 = 200 audio/mpeg; custom domain still bound (enabled, cert intact).
      New version 52721c96. Redeploy next time:
        cd workers && CLOUDFLARE_API_TOKEN=<workers-token> npx wrangler deploy --config ../wrangler-site.toml
- [x] AUTH GOTCHA (documented for next time): the `wrangler login` OAuth token returns Authentication error
      [code 10000] on ALL account-scoped ops — Pages AND Workers — because it's missing User->User Details/
      Memberships->Read, and a plain re-login does NOT add it (fixed OAuth scopes). A scoped API token is
      required: create one via dash → My Profile → API Tokens → "Edit Cloudflare Workers" template.
- [ ] SECURITY — delete the API tokens pasted during deploy (1 Pages token — wrong type; 1 Workers token)
      from dash.cloudflare.com → My Profile → API Tokens. Both were exposed in chat and should be rotated out.

