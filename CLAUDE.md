## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Marketing Reference Docs (in `marketing/`)
Living docs for the launch/marketing campaign — check these first when working on social, content, or launch tasks:
- **`marketing/YOUTUBE_UPLOADS.md`** — YouTube Shorts titles + descriptions. **The go-to file whenever uploading a new video to YouTube.** Add a new entry (using its template) each time a teardown is produced.
- **`marketing/CROSS_PLATFORM_KIT.md`** — **the reusable generator for per-episode titles + captions across YouTube/TikTok/IG/Reddit.** Fill 8 variables → 3 title options per platform. Encodes the **L9 title strategy** (curiosity question + literal search keyword) + per-platform algo rules. Run this for every episode's post copy (the daily SOP step 4 points here).
- **`marketing/TITLE_MATRIX.md`** — **the one-stop posting reference: one card per video with ALL three platform titles (YouTube · TikTok/IG hook · Reddit) side by side.** This is what the daily routine opens to avoid cross-referencing 3 files. The KIT *generates* the titles; the MATRIX *stores the chosen one* per video. Add a card (using its template) each time a teardown is produced.
- **`marketing/CAPTIONS.md`** — paste-ready captions for all platforms + the real social handles (YT `@SafeCart0_0`, IG `@safecartt`, TikTok `@safecart7`).
- **`marketing/CONTENT_CALENDAR.md`** — the 14-day posting schedule + asset status (🟢 ready / 🔵 I make / 🟡 you make).
- **`marketing/DAILY_ROUTINE.md`** — the "what to post each morning" 10-minute checklist.
- **`marketing/PROFILE_SETUP.md`** — per-platform bios + the bio-link strategy (incl. the TikTok no-business-account workaround).
- **`marketing/reddit-posts.md`** — engineered, ready-to-paste Reddit **posts** (source of truth for *what* to post) · **`marketing/reddit-launch-kit.md`** — Reddit *strategy* (how to behave, value comments, replies) · **`marketing/PRODUCT_HUNT.md`** — Product Hunt kit.
- **`marketing/origin-story.md`** — the founder story in every format (full · 2-sentence · bio one-liner · 15-sec face-cam script).
- **`marketing/VIDEO_WORKFLOW.md`** — **THE source of truth for producing a teardown video.** Read this FIRST before editing/rendering any scam video. **Two formats:** (1) split-screen voiceover-sync style — master `ep06-giftcard-v2.html` (§0–8); (2) **v6 full-frame fast-paced + face-cam reaction bubbles + synthesized SFX** — master `ep18-otp-scam.html`, one-command builder `_build18.cjs` (§9).
- Video/image assets live in `marketing/`: `scam-ep0*.mp4` + `scam-demo-voiced.mp4` (teardowns), `redflags-*.png` / `chargeback-*.png` (carousels). Render engines: `render-ep.cjs`, `carousel-render.cjs` (headless Chrome + `ffmpeg-static`).
