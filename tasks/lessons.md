# Lessons (self-correction log)

> Append a rule after any user correction. Review at session start.

## Video / ffmpeg

### L1 — Verify cut boundaries by sampling DENSELY (every 1–2 frames), not every 0.5s
On #06 I spliced a face intro onto the teardown and declared it "clean" after checking frames at 9.5s (face) and 10.0s (light hook). The user caught a **~4-frame dark-hook flash at 9.83–9.95s** that my sparse sampling jumped over. A glitch shorter than your sample spacing is invisible.
**Rule:** when validating a splice/cut/transition, sample at ~0.03–0.07s spacing across the boundary (at 30fps that's every 1–2 frames). Never sign off a boundary from two samples 0.5s apart.

### L2 — Find a cut boundary on-screen; never trust arithmetic
`scam-ep06-intro-short.mp4` = face-cam + the OLD dark teardown. I computed the face length as `42.70 − 32.70 = 10.0s` and grabbed "the first 10.0s" — which overshot the real face→dark cut (~9.85s) and bled in 4 frames of the old dark hook. The subtraction was wrong because the appended teardown wasn't exactly the file I assumed.
**Rule:** to slice segment A out of a composite A+B file, frame-sample the actual A→B boundary and **bias the cut EARLY** (cut at 9.80s when dark starts at 9.867s). Losing one frame of wanted content beats including one frame of unwanted content.

### L3 — When the user reports a frame artifact, trust it and inspect at frame resolution
I twice explained the dark frame away as "you're viewing the old file." It was real, in the deliverable, both times. The user was right.
**Rule:** a user-reported visual glitch is ground truth until frame-level extraction proves otherwise. Inspect before explaining.

### L4 — A fix built on a misread problem is wasted work
The user first asked to "hold the hook 2s longer" — but the real issue was the dark-frame bleed, not hook duration. The hold (full re-render + voice-silence insert + re-splice) didn't address it and had to be reverted.
**Rule:** before a multi-step fix, confirm the actual defect with evidence (a frame, a log). Don't act on the *described* fix if the *underlying* problem is unverified.

## Marketing / distribution

### L8 — Don't run a single-topic branded account into a promo-strict sub — they ban the ACCOUNT, not the post
r/coolguides permanently banned the account (Jun 12, 2026) for self-promotion, even though we posted the credit-free PNG with no link. The ban was about the **pattern**: a newish, single-topic account whose every guide funnels to one product = a marketing account to their mods. The better our bio-link funnel works, the more it looks like exactly what that sub bans.
**Rule:** for promo-strict design/guide subs (r/coolguides etc.), the value asset and the brand must not obviously be the same entity. Post the *visual* only to image subs that aren't promo-strict (r/Infographics), occasionally, brand-free. Put the *value* (the tells, as text) in scam subs where it's a welcomed PSA. Keep 9:1 (comment ≫ post). **Never circumvent a community ban with a new account — Reddit treats that as ban evasion → sitewide ban.** Engineer distribution so no single account is both the helper and the advertiser.

### L9 — YouTube titles = curiosity question (WHY/How/Can) + the real search keyword
Data (ep11 vs ep13): "Why Can a Website Open Your Terminal?" pulled **75% of views from SEARCH** and won (1k); descriptive "That X Is a Scam" titles died. But a "Why" title *alone* isn't enough — ep13's "WHY SCAMMERS hunt…" still flopped (0% search) because the topic wasn't searched and the title carried no keywords people type. Then on ep16 I wrote a curiosity-*only* title ("Why Your Copied Crypto Address Can Change…") missing the literal search terms — the user caught it.
**Rule:** every YouTube title = a curiosity **question** (Why/How/Can — withhold the answer) **+ the literal keyword a victim would search**, mirroring their phrasing where possible (e.g. `Why Did My Crypto Go to the Wrong Address? (Clipboard Malware)` mirrors "crypto went to wrong address" + keyword "clipboard malware"). Curiosity wins the click; the keyword wins the search. And it only pays off on a **searchable topic** — the topic is the bigger lever; a perfect title can't rescue an unsearched one. Log every title in `marketing/YOUTUBE_UPLOADS.md`.

## Infographics / design

### L7 — A split-screen seam should be invisible, not decorated — blend, don't draw a line
On ep12 I divided the animation-top / face-bottom panels with a 6px brand-blue `drawbox` line. The user circled it: a saturated divider is the single highest-contrast edge on the frame, so the eye locks onto the *break* instead of the content, and it screams "two stacked clips."
**Rule:** make the seam disappear. Remove the line; blend the two frames with a vertical-blur feather band (Recipe E in `VIDEO_WORKFLOW.md`). Engineer the inputs to blend: face-bg brightness ≈ the page cream, and build the opener card with a **light bottom edge** so it dissolves into the wall. A seam you can't find > a seam you decorated.

### L6 — Never show a working attack command/recipe on screen — TikTok will block the video
ep11 showed the real fake-CAPTCHA keystrokes + a live `powershell -e …` payload. TikTok's moderation flagged it "not eligible for For You recommendation" → 1 view on our best platform, while the same video did 931 on YouTube (more permissive for security education).
**Rule:** in any malware/attack teardown, REDACT the payload (`powershell ************ — REDACTED`) and show only what's needed for the lesson, never a copy-pasteable recipe. Label the redaction visibly (reads responsible to reviewers + viewers). If a video gets restricted: tap the appeal in the banner (no text needed) — education usually gets reinstated. Platform sensitivity ranking for this content: TikTok strictest > Instagram > YouTube most permissive.

### L5 — No "№ 0X" in Field Guide headers — it reads as AI/templated
User circled the "№ 03" eyebrow on the chargeback guide: *"looks very AI."* The numero sign + zero-padded number is a tell of templated/AI design.
**Rule:** the Field-Guide eyebrow is just **"FIELD GUIDE"** (optionally a topic word) — never "· № 0X" — and the footer subtext drops the number too. Applies to ALL guides and every future one: when copying a guide as a template, strip any series number from the header before rendering.
