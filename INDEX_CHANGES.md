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
| Chat API key | `data.response` | `data.reply` (correct) |
| Stats error | Silent empty card | Banner shown |
| Template fetch error | Silent "no templates" | Skipped, Claude not misled |
| After template save | Short text only | Text + refreshed list |
| After meal log | Stats card always shown | Stats card only if data valid |
