# 🛠️ Fix Backlog — Calorie Tracker PWA

> **Goal:** Make the app a *smart, flexible* personal calorie tracker with no broken
> flows and clear UX. Work sprint-by-sprint. After each sprint: commit, push, clear
> Claude session, start a fresh session for the next sprint.

---

## 📊 Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔲 | Not started |
| 🟡 | In progress |
| ✅ | Done — code merged + UAT passing |
| ⏸️ | Blocked / deferred |
| ❌ | Cancelled |

## 🏁 Sprint Workflow (per sprint)

1. **Open new session** — paste: *"Read FIX_BACKLOG.md and start Sprint N"*
2. **Plan** — agent reads sprint goals & confirms approach with user
3. **Implement** — one item at a time, mark 🟡 → ✅ in this file
4. **UAT** — agent runs / writes Playwright tests for each item's Acceptance Criteria
5. **Commit + push** — feat/fix branch, descriptive message
6. **Update FIX_BACKLOG.md** — mark items ✅, add commit SHA next to each
7. **End of sprint** — agent writes a short retro at the bottom of this file
8. **Clear session** — user clears Claude session to free context tokens
9. **Next sprint** — repeat

---

# 🚀 SPRINT 1 — Unblock Core "Log a Meal" Flow

**Sprint goal:** A user can log a meal — by photo, by template, or via chat —
with clear visible feedback, and can verify their goals in Settings.

**Estimated effort:** ~1 day · **Token budget:** 1 fresh session

| ID | Status | Item | Effort |
|----|--------|------|--------|
| S1-1 | ✅ | CB-1 Allow sending a photo with empty text | S |
| S1-2 | ✅ | CB-2 Photo thumbnail preview after upload | S |
| S1-3 | ✅ | CB-3 "➕ Log this" button on template cards | M |
| S1-4 | ✅ | UX-3 Confirm / Cancel buttons on pending action | M |
| S1-5 | ✅ | UX-2 Read-only "Current Targets" summary in Settings | S |
| S1-6 | ✅ | UX-1 Remove duplicate camera icon from quick actions | XS |

---

### S1-1 · Allow sending a photo with empty text

**Bug:** `sendMsg()` exits early when input text is empty, even if a photo is queued
(`index.html:1352-1353`). User uploads photo → taps Send → silent failure.

**Fix:**
- In `sendMsg()`, if `text === ''` AND `pendingPhoto` exists, fall back to a
  default prompt: `"Please analyse this photo and estimate calories + macros."`
- If neither text nor photo, do nothing (current behaviour).

**Acceptance Criteria (UAT):**
- [ ] **S1-1-AC1** Upload photo, leave input empty, tap Send → request fires to `chat`
  endpoint with both default prompt AND photo in the message content.
- [ ] **S1-1-AC2** Empty input + no photo + tap Send → no request fires.
- [ ] **S1-1-AC3** After photo-only send, the response renders Claude's analysis and
  triggers the same low-confidence card flow as before.

---

### S1-2 · Photo thumbnail preview after upload

**Gap:** After photo upload, the only feedback is the camera icon turning green.
No thumbnail, no filename, no remove button. Users don't know anything happened
(`index.html:1167-1177`).

**Fix:**
- Add a small chip above the input bar after `handlePhotoSelected`:
  `[ <40×40 thumb> filename.jpg  ✕ ]`
- ✕ button clears `pendingPhoto` and removes the chip.
- Chip is removed automatically after the photo is sent.

**Acceptance Criteria (UAT):**
- [ ] **S1-2-AC1** Selecting a photo renders a chip with thumbnail + filename.
- [ ] **S1-2-AC2** Clicking ✕ removes the chip AND clears `pendingPhoto`.
- [ ] **S1-2-AC3** After successful send, the chip disappears.
- [ ] **S1-2-AC4** Chip survives keyboard open/close and screen scrolling
  (visually anchored above input bar).

---

### S1-3 · "➕ Log this" button on template cards

**Gap:** `renderTemplatesCard()` displays template details but provides no way
to act on them. User must type the template name in chat
(`index.html:912-927`).

**Fix:**
- Add a `<button class="template-log-btn">➕ Log this</button>` to each
  `.template-card`.
- Click handler stores the template as `pendingAction = { action:'logMeal',
  payload:{...templateData, mealType:template.mealType, notes:'from template:
  <name>'} }` then asks for inline confirm (uses S1-4's confirm/cancel buttons).

**Acceptance Criteria (UAT):**
- [ ] **S1-3-AC1** Each template card has a visible "➕ Log this" button.
- [ ] **S1-3-AC2** Clicking it shows a Confirm / Cancel prompt with the meal name.
- [ ] **S1-3-AC3** Confirm → `logMeal` is called with `notes="from template: <name>"`
  and the template's macros.
- [ ] **S1-3-AC4** Cancel → no API call, no state change.

---

### S1-4 · Confirm / Cancel buttons on pending action

**Gap:** When Claude proposes an action, user must type "yes" — there's no
button. Many users won't realise this (`index.html:1359-1382`).

**Fix:**
- When `pendingAction` is set, render a small action panel below Claude's last
  message: `[ ✓ Confirm ]  [ ✕ Cancel ]`.
- Confirm → calls `executeAction(...)` directly.
- Cancel → clears `pendingAction`, posts a tiny "Cancelled" hint message.
- Typing "yes" in input still works (backward-compatible).

**Acceptance Criteria (UAT):**
- [ ] **S1-4-AC1** When `pendingAction` is set, two buttons appear inline.
- [ ] **S1-4-AC2** Confirm triggers `executeAction` with the same payload.
- [ ] **S1-4-AC3** Cancel clears `pendingAction` and shows "Cancelled" hint.
- [ ] **S1-4-AC4** Typing "yes" still works (no regression in F-2.3-T).
- [ ] **S1-4-AC5** Buttons disappear once confirmed/cancelled or a new message arrives.

---

### S1-5 · Read-only "Current Targets" summary in Settings

**Gap:** Settings shows editable inputs only. User can't tell at a glance what
their current goals are; empty inputs look like "no targets set"
(`index.html:610-643`).

**Fix:**
- Above the editable form add a compact summary row:
  `🎯 Current: 2200 kcal · P 150g · F 70g · C 250g · Fiber 25g`
  `🍽 Per meal: B 500 · L 700 · D 700 kcal`
- Pulled from the same `getStats` call that populates the inputs.
- If no targets set, show: *"No targets configured yet — set them below."*

**Acceptance Criteria (UAT):**
- [ ] **S1-5-AC1** Opening Settings shows a "Current Targets" read-only block
  with the active values from the sheet.
- [ ] **S1-5-AC2** When user has no `User_Targets` row, friendly empty-state text shown.
- [ ] **S1-5-AC3** After saving, the read-only summary updates without a page reload.

---

### S1-6 · Remove duplicate camera icon from quick actions

**Gap:** Camera lives both in the input bar AND in the quick-actions pill bar
above it (`index.html:556`).

**Fix:**
- Delete the `📷 Photo` button from `#quick-actions`.
- Replace with `📅 Yesterday` (queries stats for yesterday) so the slot stays useful.

**Acceptance Criteria (UAT):**
- [ ] **S1-6-AC1** Only one camera icon visible on the chat screen.
- [ ] **S1-6-AC2** New `📅 Yesterday` button shows yesterday's stats card.
- [ ] **S1-6-AC3** Existing `☰ Templates` and `📊 Today's Stats` still work.

---

## 📝 Sprint 1 Retro

**Completed (single Sprint 1 commit):**
- **S1-1** · `sendMsg()` accepts photo-only input — falls back to default
  prompt `"Please analyse this photo and estimate calories + macros."` when
  text is empty but `pendingPhoto` is queued.
- **S1-2** · Photo chip with 40×40 thumb + filename + ✕ remove rendered above
  the input bar after upload; cleared on send and on remove. New helpers:
  `showPhotoChip` / `hidePhotoChip` / `clearPendingPhoto`.
- **S1-3** · `renderTemplatesCard` now appends `➕ Log this` to every card.
  `logTemplateFromCard(btn)` decodes the URI-encoded payload from `data-payload`,
  sets `pendingAction = { action: 'logMeal', payload: {...,
  notes: 'from template: <name>'} }`, posts a confirm prompt, and reuses the
  S1-4 buttons.
- **S1-4** · Inline `pending-action-row` (✓ Confirm / ✕ Cancel) rendered
  whenever `pendingAction` is set. Backward-compatible with typing "yes"/"no";
  cleared on new message, confirm, cancel, or chat clear. New functions:
  `showPendingActionButtons` / `clearPendingActionButtons` /
  `confirmPendingAction` / `cancelPendingAction`.
- **S1-5** · `#targets-summary` block above the Daily Targets form. Populated
  by new `renderTargetsSummary(t)` from the same `getStats` call that fills
  the inputs; shows "No targets configured yet — set them below." when empty;
  refreshed on save without a reload.
- **S1-6** · Quick-actions bar: `📷 Photo` removed (camera still in input
  bar). New `📅 Yesterday` button calls `showYesterdayStats()`, which sends
  `getStats` with an explicit `date` body field. `apiFetch` was tweaked to
  use `body.date || localDateString()` so explicit overrides survive.

**Tests added (`tests/sprint1.test.js`):** 21 Playwright tests covering all
acceptance criteria S1-1-AC1 through S1-6-AC3. All 21 pass; full UAT
regression (62 tests) still passes.

**Deferred / new issues:** none discovered in this sprint.

---
---

# 🛡️ SPRINT 2 — Trust & Reliability

**Sprint goal:** The app never lies about success, never silently breaks, and
guards against malformed AI output.

**Estimated effort:** ~1 day · **Token budget:** 1 fresh session

| ID | Status | Item | Effort |
|----|--------|------|--------|
| S2-1 | 🔲 | CB-5 Fix service-worker silent failure | S |
| S2-2 | 🔲 | CB-4 Don't drop `pendingAction` on refinement replies | M |
| S2-3 | 🔲 | MP-2 Refuse saving all-zero targets | S |
| S2-4 | 🔲 | MP-3 Sanitize Claude output — no raw HTML allowed | S |
| S2-5 | 🔲 | MP-4 Tighten action-JSON parser (require fenced block) | S |
| S2-6 | 🔲 | UX-7 Stop spamming stats card after every save | S |
| S2-7 | 🔲 | MP-10 Auto-dismiss error banner on next success | XS |
| S2-8 | 🔲 | MP-8 Clear `pendingPhoto` on chat clear | XS |

---

### S2-1 · Fix service-worker silent failure

**Bug:** SW catches network errors and returns `{}` for Apps Script URLs. App
treats this as success → user sees stats cards full of zeros and "save failed"
banners simultaneously (`index.html:1641-1645`).

**Fix:**
- SW returns `new Response(JSON.stringify({error:"offline", offline:true}),
  {status:503})` instead of `{}`.
- Client surfaces `"You appear to be offline — please check your connection"`
  via the existing banner.

**Acceptance Criteria:**
- [ ] **S2-1-AC1** Simulated offline → user sees "offline" banner, not blank stats.
- [ ] **S2-1-AC2** No false-positive ✅ confirmations when offline.
- [ ] **S2-1-AC3** Reconnection → next request succeeds normally.

---

### S2-2 · Don't drop pendingAction on refinement replies

**Bug:** Any non-affirmative reply wipes `pendingAction`
(`index.html:1381`). User says *"actually 200g not 250g"* → modification lost.

**Fix:**
- Keep `pendingAction` set; pass the user's free-text reply back to Claude with
  the previous payload as context. Claude returns a refined payload → replace
  `pendingAction` with new payload, ask user to confirm again.
- A clear "Cancel" via S1-4 buttons or text *"cancel/no/abort"* clears it.

**Acceptance Criteria:**
- [ ] **S2-2-AC1** With a `pendingAction` set, sending *"make it 200g"* preserves
  intent and returns an updated payload.
- [ ] **S2-2-AC2** Sending *"cancel"* / *"no"* clears the action.
- [ ] **S2-2-AC3** No regression for affirmative reply path (F-2.3-T).

---

### S2-3 · Refuse saving all-zero targets

**Bug:** `saveTargetsForm` writes 0s when fields blank → Claude system prompt
breaks for that user (`index.html:1714-1726`).

**Fix:**
- Validate before save: at least `calories` must be > 0.
- If a field is empty, send the **previously saved value** for that field
  (not 0). Backend gets the real merged state.

**Acceptance Criteria:**
- [ ] **S2-3-AC1** Saving with empty `calories` shows inline error, no API call.
- [ ] **S2-3-AC2** Saving with `calories=2000` and other fields blank preserves
  previously saved protein/fat/carbs (verified via subsequent `getStats`).

---

### S2-4 · Sanitize Claude output

**Bug:** `containsHtml()` lets Claude inject HTML directly into a `bubble.innerHTML`
(`index.html:929-931, 1300`). XSS surface from upstream model output.

**Fix:**
- Drop `containsHtml`. All Claude text → `bubble.textContent` always.
- Only our own renderers (`renderStatsCard`, `renderTemplatesCard`,
  `renderTargetsCard`, `showPhotoEditCard`) write `innerHTML` — and they
  already pass user data through `escapeHtml()`.

**Acceptance Criteria:**
- [ ] **S2-4-AC1** Mock Claude reply with `<script>alert(1)</script>` → text
  appears literally, no script execution.
- [ ] **S2-4-AC2** Stats / templates / targets cards still render correctly.

---

### S2-5 · Tighten action-JSON parser

**Bug:** Any `{"action":...}` substring in Claude's prose is parsed and
executed (`index.html:737-777`).

**Fix:**
- Only accept JSON inside a fenced ``` ```json ``` block, OR as the very last
  line of the message.
- Strip from text before display either way.

**Acceptance Criteria:**
- [ ] **S2-5-AC1** Claude says *"For example, the JSON would look like
  `{"action":"logMeal",...}`"* → no action triggered.
- [ ] **S2-5-AC2** Properly fenced JSON → action triggered as before (no F-2.3-T regression).

---

### S2-6 · Stop spamming stats card after every save

**Bug:** Every `executeAction` for logMeal/deleteMeal/updateMeal pushes a full
stats card (`index.html:1093-1107`). Log 4 meals → 4 stats cards.

**Fix:**
- After save, push only the running totals line.
- Keep full stats card only when explicitly requested via *"show my stats"*.

**Acceptance Criteria:**
- [ ] **S2-6-AC1** Log 3 meals in a row → exactly 0 stats cards in chat (only
  3 short totals lines).
- [ ] **S2-6-AC2** Sending *"show my stats"* still renders the full card.

---

### S2-7 · Auto-dismiss error banner on next success

**Bug:** `#error-banner` stays visible forever until user clicks Retry
(`index.html:248-267`). Confusing if next request succeeds.

**Fix:** Call `hideBanner()` in every successful response path of `sendMsg`,
`executeAction`, etc. (Most paths already call `hideBanner()` at the start —
add to success paths too.)

**Acceptance Criteria:**
- [ ] **S2-7-AC1** Trigger error → banner shown. Send a new successful message →
  banner gone within 1s.

---

### S2-8 · Clear pendingPhoto on chat clear

**Bug:** `clearChat()` doesn't reset `pendingPhoto` (`index.html:1581`).

**Fix:** Add `pendingPhoto = null;
document.getElementById('btn-photo').classList.remove('has-photo');` and clear
the photo chip from S1-2.

**Acceptance Criteria:**
- [ ] **S2-8-AC1** Upload photo → Clear chat → confirm → photo chip and
  `has-photo` indicator both gone.

---

## 📝 Sprint 2 Retro

> _To be filled by agent_

---
---

# 🧠 SPRINT 3 — "Smart & Flexible" Tracker Depth

**Sprint goal:** Move from "log only" tool to a tracker that lets users review,
edit, and understand their data over time.

**Estimated effort:** ~1.5 days · **Token budget:** 1 fresh session

| ID | Status | Item | Effort |
|----|--------|------|--------|
| S3-1 | 🔲 | UX-5 Date picker for past-day stats | M |
| S3-2 | 🔲 | UX-6 Tap-to-edit / delete meals from stats card | M |
| S3-3 | 🔲 | N-1 Circular progress ring (match design ref) | M |
| S3-4 | 🔲 | N-4 Per-meal target progress bars in stats card | S |
| S3-5 | 🔲 | N-5 Expandable meal chips (ingredients + macros) | M |
| S3-6 | 🔲 | MP-6 Undo toast after destructive actions | S |
| S3-7 | 🔲 | MP-1 Hide internal IDs from confirmation messages | XS |

---

### S3-1 · Date picker for past-day stats

**Gap:** UI only ever shows today. Backend `getStats` accepts any `date`.

**Fix:**
- Add `← Today →` chevrons in the stats card header (or a date pill).
- Re-query `getStats` with selected date.
- "Today" label switches to formatted past date (*"Wed, May 6"*).

**Acceptance Criteria:**
- [ ] **S3-1-AC1** Stats card shows date label (today by default).
- [ ] **S3-1-AC2** Tapping ← / → shifts the displayed date by 1 day, fetches
  new stats.
- [ ] **S3-1-AC3** Quick-action `📅 Yesterday` (from S1-6) loads yesterday's stats.

---

### S3-2 · Tap-to-edit / delete meals from stats card

**Gap:** Only chat triggers edit/delete. Backend supports both directly.

**Fix:**
- Each meal chip → tap opens a small action sheet:
  `[ Edit name/macros ] [ Delete ] [ Cancel ]`
- Edit → opens a form similar to `showPhotoEditCard` pre-filled with current
  values; Save → `updateMeal`.
- Delete → confirm dialog → `deleteMeal`.

**Acceptance Criteria:**
- [ ] **S3-2-AC1** Tapping a meal chip opens the action sheet.
- [ ] **S3-2-AC2** Edit → save → stats refresh shows new values.
- [ ] **S3-2-AC3** Delete → confirm → meal removed, stats refresh.
- [ ] **S3-2-AC4** Undo toast appears (S3-6).

---

### S3-3 · Circular progress ring

**Gap:** Stats card uses linear bars; design reference (`Calorie Tracker.html`)
has a circular ring around the calorie number.

**Fix:**
- Port the SVG ring from `Calorie Tracker.html:163-176` into `renderStatsCard`.
- Display large number + % consumed inside the ring.
- Bars below for protein / fat / carbs.

**Acceptance Criteria:**
- [ ] **S3-3-AC1** Stats card shows ring with correct % fill matching consumed/target.
- [ ] **S3-3-AC2** Ring colour switches to red when consumed > target.
- [ ] **S3-3-AC3** No regression in `renderTargetsCard` / mealsByType chips.

---

### S3-4 · Per-meal target progress

**Gap:** Stats card shows per-meal kcal but not progress vs `breakfastCal`,
`lunchCal`, `dinnerCal`.

**Fix:**
- In each meal chip, show small bar + `420 / 500 kcal` if a target exists.
- Otherwise just kcal as today.

**Acceptance Criteria:**
- [ ] **S3-4-AC1** When per-meal targets are set, chip shows bar.
- [ ] **S3-4-AC2** When not set, chip shows just kcal (no broken layout).

---

### S3-5 · Expandable meal chips

**Gap:** Meal chips only show name + kcal. No way to see what was actually logged.

**Fix:**
- Tapping a meal chip (when not in edit mode) expands it inline to show:
  `Ingredients: ...` and `P:Xg F:Yg C:Zg`.
- Combine with S3-2 by adding edit/delete buttons in the expanded view.

**Acceptance Criteria:**
- [ ] **S3-5-AC1** Tap chip → expanded view shows ingredients + macros.
- [ ] **S3-5-AC2** Tap again → collapses back.

---

### S3-6 · Undo toast

**Gap:** Wrong delete or update is irreversible without another chat turn.

**Fix:**
- After every `deleteMeal` / `updateMeal` show a 5s toast: `"Deleted breakfast.
  Undo?"`.
- Undo → re-creates the deleted row (`logMeal` with original payload) or
  re-applies original values.

**Acceptance Criteria:**
- [ ] **S3-6-AC1** Delete → toast appears for 5s.
- [ ] **S3-6-AC2** Tapping Undo within 5s restores the meal.
- [ ] **S3-6-AC3** No undo offered after the 5s window.

---

### S3-7 · Hide internal IDs from confirmation messages

**Cosmetic:** `"✅ Done — Meal logged to today's log! (ID: 7)"` exposes a
backend detail (`index.html:1070-1071`).

**Fix:** Drop the `(ID: ...)` suffix.

**Acceptance Criteria:**
- [ ] **S3-7-AC1** logMeal confirmation reads `✅ Done — Meal logged to
  today's log!` only.

---

## 📝 Sprint 3 Retro

> _To be filled by agent_

---
---

# 🚢 SPRINT 4 — Pre-Production Hardening

**Sprint goal:** Safe to share with friends / put on a public URL.

**Estimated effort:** ~0.5 day · **Token budget:** 1 fresh session

| ID | Status | Item | Effort |
|----|--------|------|--------|
| S4-1 | 🔲 | CQ-1 + N-8 Strip mocks/test hooks for production build | S |
| S4-2 | 🔲 | MP-7 Compress chat history (don't store rendered HTML) | M |
| S4-3 | 🔲 | N-7 PWA install prompt | XS |
| S4-4 | 🔲 | CQ-4 Real-API smoke tests against staging deployment | M |

---

### S4-1 · Strip mocks/test hooks

**Risk:** `window.__mockChatFail` etc. are still in `index.html:1652-1681`.
Anyone running `__mockSetTargets={ok:true}` in the console can fake state.

**Fix:**
- Wrap test hooks in `if (location.search.includes('test=1'))` guard.
- Or build a minimal pre-deploy script that strips `// TEST_HOOKS_START` →
  `// TEST_HOOKS_END` block.

**Acceptance Criteria:**
- [ ] **S4-1-AC1** Production build has no `window.__mock*` defined.
- [ ] **S4-1-AC2** Test build (with `?test=1`) still runs full Playwright suite.

---

### S4-2 · Compress chat history storage

**Risk:** Rendered HTML cards stored in localStorage can quickly hit the 5MB
quota.

**Fix:**
- Replace `{ html: <full string> }` with `{ kind: 'stats', data: {...} }` /
  `{ kind: 'templates', data: [...] }`.
- Re-render via the corresponding `render*Card` on load.
- Drop / migrate old entries on first read.

**Acceptance Criteria:**
- [ ] **S4-2-AC1** localStorage size after 50 stats refreshes < 200 KB.
- [ ] **S4-2-AC2** Reload restores all chat correctly with cards re-rendered.

---

### S4-3 · PWA install prompt

**Gap:** Manifest is registered, but no `beforeinstallprompt` UX.

**Fix:** Capture the event, show an "Install app" pill in the empty state.

**Acceptance Criteria:**
- [ ] **S4-3-AC1** Chromium browser on supported platform shows the install pill.
- [ ] **S4-3-AC2** Tapping it triggers the native install dialog.

---

### S4-4 · Real-API smoke tests

**Risk:** Mocked tests passed but real API had a date bug (commit `144734e`).
Need at least one integration test against a staging deployment.

**Fix:**
- Add `tests/integration.test.js` that hits a *staging* Apps Script deployment
  with a test user and runs a tiny smoke flow: validateUser → setTargets →
  logMeal → getStats → deleteMeal.

**Acceptance Criteria:**
- [ ] **S4-4-AC1** Integration test runs locally and passes against staging.
- [ ] **S4-4-AC2** Documented in PROGRESS.md how to deploy staging copy.

---

## 📝 Sprint 4 Retro

> _To be filled by agent_

---

# 📚 Reference

Source analysis (full bug list, evidence, line numbers): conversation transcript
that produced this backlog (2026-05-08).

Original PRD: `PRD.docx` · Architecture rules: `CLAUDE.md` · Test fixtures:
`tests/helpers.js`.
