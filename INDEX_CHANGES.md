# index.html — Change Log

This file tracks every meaningful change to `index.html` by session and branch.
Use it to understand what is in the current file vs what is on `main`.

---

## main branch — v1.0 (commit 2a4e4c5, 2026-05-07)

Full feature-complete build. All 37 UAT scenarios passing (43 Playwright tests).

### CSS variables (`:root`)
| Variable | Value | Purpose |
|---|---|---|
| `--bg` | `oklch(0.975 0.006 80)` | App background (warm cream) |
| `--bg-deep` | `oklch(0.95 0.008 80)` | Slightly darker surface |
| `--surface` | `#ffffff` | Cards, bubbles |
| `--border` | `oklch(0.91 0.005 80)` | All borders |
| `--text` | `oklch(0.18 0.01 250)` | Primary text |
| `--text-mid` | `oklch(0.44 0.01 250)` | Secondary text |
| `--text-light` | `oklch(0.62 0.008 250)` | Placeholder / timestamps |
| `--accent` | `#3d8b5e` | Green — user bubbles, progress bars, send button |
| `--red` | `oklch(0.56 0.17 25)` | Error states |
| `--amber` | `oklch(0.66 0.14 72)` | Fat macro bar |
| `--green` | `oklch(0.52 0.14 152)` | "Online" status |

### Screens
- `#login-screen` — Google Sign-In, session-restricted access alert
- `#chat-screen` — header, messages, input bar

### Key JS functions (main)
| Function | What it does |
|---|---|
| `apiFetch(action, body)` | POST to Apps Script, returns JSON |
| `buildSystemPromptFull()` | Fetches live stats + templates, builds Claude system prompt |
| `sendMsg()` | Main send handler — intercepts stats/targets/export queries, else calls Claude |
| `executeAction(action, payload)` | Runs confirmed logMeal/deleteMeal/updateMeal/setTargets/updateTemplate |
| `renderStatsCard(stats)` | Returns HTML string for daily stats card |
| `renderTargetsCard(stats)` | Returns HTML string for targets display |
| `parseClaudeResponse(text)` | Extracts `{"action":...}` JSON block from Claude reply |
| `showPhotoEditCard(payload)` | Injects editable card for low-confidence photo estimates |
| `exportMealLog()` | Calls exportData, triggers CSV download |
| `clearChat()` | Confirm dialog → clears localStorage chat history |
| `processLogin(email, name)` | Validates email via Apps Script, opens chat |

### Test hooks on `window` (main)
`__testLogin`, `__setSession`, `__mockChatFail`, `__mockChatResponse`, `__mockLogMealFail`, `__mockLogMeal`, `__mockStats`, `__mockTemplate`, `__mockUpdateTemplate`, `__mockSetTargets`, `__mockDeleteMeal`, `__mockUpdateMeal`, `__mockExportData`, `__apiCallLog`, `__clearApiLog`, `__setPendingAction`, `__pendingAction`, `__setPendingPhoto`, `__showPhotoEditCard`

---

## fix/ui-and-chat-response branch — post-v1.0 (2026-05-07/08)

3 commits on top of main. **Not yet merged.**

### Commit 1 — 692ea0a: chat fix + UI alignment

**CSS added / changed:**
- `--avatar-color: #e65bac` added to `:root` — pink/magenta for avatars
- `.login-logo-icon` background: `var(--accent)` → `var(--avatar-color)`, box-shadow updated to match
- `.chat-avatar` background: `var(--accent)` → `var(--avatar-color)`
- `.msg-avatar` background: `var(--accent)` → `var(--avatar-color)`
- `.stats-card` gains `white-space: normal` — prevents pre-wrap bleed from `.bubble`
- New: `#quick-actions`, `.qa-btn` — bottom pill button bar
- New: `#suggestion-chips`, `.chip-btn` — vertical chips in empty state

**HTML changed:**
- `#chat-header` — download (⬇) button removed entirely
- `#chat-empty` — 3 `.chip-btn` suggestion chips added (send on click)
- New `#quick-actions` div added above `#input-bar` with 3 `.qa-btn` pills

**JS changed:**
- `apiFetch` mock for `chat` action: returns `{ reply: ... }` (was `{ response: ... }`)
- `sendMsg` chat flow: uses `data.reply` as primary key (was `data.response`); checks `data.error` before rendering
- New: `sendSuggestion(text)` — fills input + calls sendMsg
- New: `quickAction(id)` — routes photo/templates/stats buttons
- New test hooks: `__sendSuggestion`, `__quickAction`

---

### Commit 2 — 11290a1: 6 runtime bug fixes

**CSS added:**
- `#btn-stop` — red square stop button (hidden by default, shown during AI thinking)

**HTML changed:**
- `#btn-stop` button added inside `.input-wrap` (after `#btn-send`)

**JS changed:**
- New state variable: `let currentAbortController = null`
- `apiFetch(action, body, signal)` — optional signal parameter passed to fetch
- `setTyping(on)` — now also toggles `#btn-stop` / `#btn-send` visibility
- New: `stopTyping()` — aborts current AbortController, re-enables input
- `sendMsg` — pendingAction path wrapped in `try-finally` (guarantees `input.disabled = false`)
- `sendMsg` — chat fetch creates AbortController, passes signal to apiFetch
- `sendMsg` stats intercept: checks `stats.error` before rendering card; console.log added
- `sendMsg` targets intercept: checks `stats.error` before rendering card; console.log added
- `buildSystemPromptFull` — checks `s.error` on getStats result; checks `tpl.error` on getTemplate result
- `executeAction` — `updateTemplate`: fetches and shows refreshed template list after save
- `executeAction` — `setTargets`: confirmation message prefixed with ✅
- `executeAction` — logMeal/deleteMeal/updateMeal: keeps typing indicator during post-action getStats; checks `stats.error`; `hasStats` guard — stats card only shown when data is valid; confirmation text prefixed with ✅
- New test hooks: `__stopTyping`, `__getAbortController`
- console.log added at: `[chat]`, `[getStats]`, `[getStats/targets]`, `[buildSystemPrompt] getStats`, `[buildSystemPrompt] getTemplate`, `[updateTemplate]`, `[executeAction] post-action getStats`

---

### Commit 3 — a6c1e9d: settings screen

**CSS added:** `#settings-screen`, `.settings-header`, `.settings-back`, `.settings-title`, `.settings-body`, `.settings-card`, `.settings-card-title`, `.settings-account-row`, `.settings-avatar`, `.settings-account-name`, `.settings-account-sub`, `.settings-field`, `.settings-label`, `.settings-input-wrap`, `.settings-unit`, `.settings-save-btn`, `.settings-save-btn.saved`, `.settings-about-row`, `.settings-about-key`, `.settings-about-val`, `.settings-action-btn`, `.settings-action-btn.export`, `.settings-action-btn.signout`

**HTML added:**
- `#settings-screen.screen.hidden` — full screen with back button, account card, targets form (8 fields), about section, export + sign-out buttons
- `#chat-header` settings button — `onclick="openSettings()"` added

**JS added:**
- `openSettings()` — populates account info from session, pre-fills targets from getStats, switches to settings screen
- `closeSettings()` — returns to chat screen
- `saveTargetsForm()` — reads all 8 target fields, calls setTargets API, shows saved/error state on button
- `signOut()` — confirm dialog → clears session + history + shows login screen

---

### Commit 4 — real API compatibility + template rendering + settings fixes

**CSS added:**
- `.templates-list`, `.templates-list-title`, `.template-card`, `.template-card-header`, `.template-card-name`, `.template-card-type`, `.template-card-ingredients`, `.template-card-macros`, `.template-macro` — styled template list card

**HTML changed:**
- `#settings-error` div added below Save Targets button — inline error display without relying on hidden chat banner

**JS added:**
- `normalizeStats(stats)` — maps real API `totals.calories → consumed`; normalizes meal keys from TitleCase (`MealType`, `Calories`, …) to camelCase (`mealType`, `calories`, …). Mocks already use camelCase so normalization is a no-op for tests.
- `normalizeTemplates(tpls)` — maps TitleCase template keys (`TemplateName`, `Calories`, …) to camelCase. Same safe pass-through for mock data.
- `isTemplatesQuery(t)` — detects "show my templates", "list templates", etc.
- `renderTemplatesCard(templates)` — returns styled HTML list of template cards (not raw text).
- `containsHtml(text)` — detects div/span/table/… tags in Claude's reply; used to auto-set `html:true` on AI messages.

**JS changed:**
- `buildSystemPromptFull()` — applies `normalizeStats` + `normalizeTemplates`; removed debug console.log calls; added system prompt rule: "Respond in plain text only. Do not use HTML tags."
- `sendMsg()` stats intercept — applies `normalizeStats`; removed console.log
- `sendMsg()` targets intercept — applies `normalizeStats`; removed console.log
- `sendMsg()` — **new templates intercept** (before export): detects templates query → calls `getTemplate` → renders `renderTemplatesCard()` (bypasses Claude entirely)
- `sendMsg()` chat flow — removed `console.log('[chat]')`; AI message now sets `html: containsHtml(parsed.text)` so any residual HTML from Claude renders correctly
- `executeAction()` — `deleteMeal` not-found check: `!result.ok && !result.success` (real API returns `success`, not `ok`)
- `executeAction()` — general error check: `!result.ok && !result.success && !result.id` (handles real API `success` field)
- `executeAction()` updateTemplate — uses `normalizeTemplates` + `renderTemplatesCard` for refreshed list; removed console.log
- `executeAction()` post-action getStats — applies `normalizeStats`; removed console.log
- `openSettings()` — applies `normalizeStats` on targets load
- `saveTargetsForm()` — all 8 fields always sent (empty inputs → 0, not undefined, preventing silent zero-out of existing values); errors shown via `#settings-error` inline element instead of hidden chat banner
- New test hooks: `window.__normalizeStats`, `window.__normalizeTemplates`, `window.__renderTemplatesCard`, `window.__isTemplatesQuery`

**tests/uat.test.js — new tests (12 added):**
- `UI-1-T` — suggestion chips visible; clicking sends message
- `UI-2-T` — quick-action bar: ☰ shows template card, 📊 shows stats card
- `UI-3-T` — settings save targets → API called with all fields, ✓ Saved! shown
- `UI-3-T B` — settings save failure → inline `#settings-error` shown, chat banner stays hidden
- `UI-4-T` — ■ Stop button cancels in-flight request, re-enables input
- `TPLR-1-T` — "show my templates" → `.templates-list` card rendered, no raw HTML divs
- `TPLR-2-T` — template card shows name, emoji, ingredients, all 4 macros
- `TPLR-3-T` — empty template list → "No templates saved yet"
- `NORM-1-T` — real API format (`totals.calories`) renders correct consumed value in stats card
- `NORM-2-T` — real API `{success:true}` deleteMeal → "Meal deleted", not "not found"
- `NORM-3-T` — TitleCase template keys normalized correctly via `normalizeTemplates`
- `NORM-4-T` — `normalizeStats` maps `totals.calories → consumed` without overwriting existing `consumed`

**tests/uat.test.js — updated:**
- `F-9.3-T` — export test now opens settings screen first (export button moved to settings in Commit 3)

**tests/helpers.js — changed:**
- `loginAs()` — sets default `window.__mockTemplate = {found:false, templates:[], count:0}` after reload, preventing real API calls to Google Apps Script during tests (was source of flakiness)

**playwright.config.js — changed:**
- `reuseExistingServer: true` — allows running test suite against already-running dev server

---

## What changes between main and fix branch (summary)

| Area | main | fix branch |
|---|---|---|
| Avatar color | Green `#3d8b5e` | Pink `#e65bac` |
| Login logo | Green | Pink |
| Header buttons | ⬇ Download + 🗑 Clear + ⚙ Settings | 🗑 Clear + ⚙ Settings (export moved to settings) |
| Empty state | Emoji + title + subtitle | + 3 clickable suggestion chips |
| Bottom bar | None | 📷 Photo ☰ Templates 📊 Today's Stats pills |
| While AI thinks | Input disabled, no cancel | ■ Stop button cancels request |
| Settings screen | Not implemented (button dead) | Full screen with targets form + sign out |
| Templates display | Not intercepted (Claude replies) | Intercepted → styled card, Claude bypassed |
| Chat API key | `data.response` | `data.reply` (correct) |
| Stats error | Silent empty card | Banner shown |
| Template fetch error | Silent "no templates" | Skipped, Claude not misled |
| After template save | Short text only | Text + refreshed styled card |
| After meal log | Stats card always shown | Stats card only if data valid |
| Real API stats format | Not handled (`consumed` always 0) | `normalizeStats()` maps `totals.calories → consumed` |
| Real API meal keys | Not handled (TitleCase breaks system prompt) | `normalizeStats()` normalizes TitleCase → camelCase |
| Real API template keys | Not handled (TitleCase breaks template list) | `normalizeTemplates()` normalizes TitleCase → camelCase |
| deleteMeal real API | `{success:true}` shows "not found" | Fixed: checks `success` + `ok` |
| updateMeal real API | `{success:true}` throws error | Fixed: checks `success` + `ok` |
| Settings save error | Goes to hidden chat banner (invisible) | Shown in `#settings-error` in settings screen |
| Settings save fields | Partial send (undefined fields omitted → zeros existing values) | All 8 fields always sent (empty → 0) |
| Console.log debug | 6 calls left in (chat/getStats/updateTemplate/etc.) | All removed |
