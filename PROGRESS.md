# Calorie Tracker — Progress

## Sessions completed
- Session 0 — Scaffolding: `index.html` created (login screen, chat screen, PWA manifest + SW, apiFetch helper, session management, chat history)
- Session 1 — Meal Logging: getStats → system prompt, action JSON parser, pending action flow, logMeal execution, post-save kcal totals, error banners, photo button
- Session 2 — Daily Stats: `renderStatsCard()`, `macroStatus()`, `isStatsQuery()` added; stats card injected on "show my stats"/"today's summary"/"how am I doing"; auto-refresh after logMeal/deleteMeal/updateMeal; `__mockStats` test hook
- Session 3 — Meal Templates: templates fetched via `getTemplate` and injected into system prompt as `SAVED TEMPLATES:` block; TODAY section now includes full macros + ID per meal; `updateTemplate` action handled; `parseClaudeResponse` upgraded to balanced-brace parser with string-escape awareness + code-block fallback
- Session 4 — Targets: `setTargets` pending action flow; `isTargetsQuery()` detects targets queries; `renderTargetsCard()` card; targets query intercept in `sendMsg`; system prompt updated with setTargets field names
- Session 5 — Edit & Delete: `deleteMeal` and `updateMeal` pending action flows; not-found handling for deleteMeal; distinct confirm messages per action type; stats refresh after delete/edit
- Session 6 — History, Export & Suggestions: export button + `exportMealLog()` + `isExportQuery()`; `clearChat()` confirmation dialog; `showConfirm()`/`hideConfirm()`/`confirmOk()` modal
- Session 7 — Photo Parsing: `photoIncludedInMessage` flag; `notes="logged from photo"` auto-injected; `isLowConfidence()` detector; `showPhotoEditCard()` editable inline card; `confirmPhotoEdit()` reads edited values
- Session 8 — Full UAT Run: 43 Playwright test cases covering all 37 UAT scenarios — 0 failures; 1 test-assertion fix (null class check on `#error-banner`); zero bugs found in `index.html`; suite committed as `tests/uat.test.js` + `tests/helpers.js` + `playwright.config.js`
- **Fix Branch (branch: fix/ui-and-chat-response, 2026-05-07/08)** — post-v1.0 bug fixes + UI alignment found during first real-device test:
  - Commit 1 (692ea0a): chat `data.reply` fix; `data.error` check; avatar → pink `#e65bac`; download button removed from header; 3 suggestion chips in empty state; quick-action pill bar (📷 Photo / ☰ Templates / 📊 Today's Stats); `sendSuggestion()` + `quickAction()`
  - Commit 2 (11290a1): `getStats` error handling (`stats.error` checked before rendering); `buildSystemPromptFull` checks `tpl.error`; AbortController + ■ Stop button; `setTyping()` toggles stop/send; `pendingAction` path uses try-finally; `executeAction` keeps typing during post-action getStats; `updateTemplate` shows refreshed list immediately; `white-space:normal` on `.stats-card`; login logo → pink; console.log at key API calls
  - Commit 3 (a6c1e9d): full settings screen — account card, daily targets form (pre-fills from getStats, saves via setTargets), export CSV button moved from header to settings, sign-out clears session + history

## UAT tests passing
- F-1.1-T · Login screen loads, Google button visible, no app content behind it
- F-1.2-T · Non-whitelisted email → "Access restricted — this app is private"
- F-1.4-T · Existing session in localStorage → skip login, show chat with history restored
- F-2.1-T A · "150g chicken breast, 100g rice, salad with olive oil" → nutritional breakdown shown
- F-2.1-T B · "a bowl of pasta" → Claude asks exactly ONE clarifying question
- F-2.2-T · Response includes kcal, protein, fat, carbs
- F-2.3-T (yes) · Claude confirmation → yes → logMeal called → ID returned
- F-2.3-T (no) · Pending action → no → logMeal NOT called
- F-2.4-T A · "log my lunch: chicken, rice" → mealType = lunch in saved payload
- F-2.5-T · "log my lunch, restaurant estimate" → notes="restaurant estimate" in payload
- F-2.6-T · "what did I eat today?" → grouped summary shown, no raw JSON visible
- F-3.1-T · "add my breakfast" → template shown → confirm → logMeal with notes="from template: breakfast"
- F-3.2-T · After logging from template → updateTemplate never called (template row unchanged)
- F-3.3-T · "update my breakfast template: 2 eggs" → confirm → updateTemplate called with new ingredients
- F-3.4-T · "log breakfast without bread" → notes="modified from template: breakfast (without bread)", template unchanged
- F-3.5-T · "save as post-gym snack: banana, whey, milk" → updateTemplate called with templateName="post-gym snack"
- F-3.6-T · "save today's lunch as template 'my_lunch'" → updateTemplate called with exact meal values
- F-3.7-T C · Template search with no matches → "No saved templates found for that search" shown
- F-4.1-T · "show my stats" → "1400 / 2200 kcal" format shown in stats card
- F-4.2-T · Protein, fat, carbs each show consumed/target (e.g. "85 / 150g")
- F-4.3-T · All 4 meal types shown in card even when 0 kcal logged
- F-4.4-T · ⚠️ Slightly low at 64%, ✅ On track at 95%, 🔴 Over target when exceeded
- F-4.5-T · After save → "You've now logged X kcal today — Y remaining" appended
- F-5.1-T · "set my daily target: 2000 calories, 140g protein…" → setTargets called, confirmation shown
- F-5.2-T · "set breakfast target to 450 kcal and lunch to 700 kcal" → setTargets with breakfastCal/lunchCal
- F-5.3-T · April targets → 1800 kcal shown; January targets → 2200 kcal shown
- F-5.4-T · "show my current targets" → readable targets card, no raw JSON
- F-6.1-T · Upload food photo → estimate shown → confirm → logMeal with notes="logged from photo"
- F-6.2-T · Product photo → nutritional info shown, serving size question asked, no raw JSON
- F-6.3-T · Low-confidence photo → "not fully sure" text + editable card shown with all fields
- F-6.4-T · Photo confirmation → mealType set (inferred), notes="logged from photo" in payload
- F-7.1-T · "suggest a meal with chicken and eggs" → 2–3 suggestions each with kcal, no raw JSON
- F-7.2-T · "suggest something under 500 kcal for dinner" → all options ≤ 500 kcal
- F-7.3-T · "high protein low fat meal" → all options protein > 30g and fat < 10g
- F-8.1-T A · "delete my breakfast" → confirm → "Meal deleted." + updated running total + stats refresh
- F-8.1-T B · "delete my dinner" (none logged) → "No dinner logged today to delete", no error banner
- F-8.2-T · "change chicken to 200g in my lunch" → recalculated shown → confirm → updateMeal called + stats refresh
- F-9.1-T · Clear chat button → confirmation dialog → confirm → chat empty, localStorage cleared
- F-9.2-T · 5 messages seeded → reload → all 5 visible, new message continues conversation
- F-9.3-T · Export button / "export my meal log" → exportData API called, Blob URL / download triggered
- ERR-1-T · Chat API down → "AI is unreachable — please try again" banner, message preserved in input
- ERR-2-T · logMeal failure → "Meal estimated but couldn't be saved — tap to retry" banner
- ERR-4-T · validateUser returns config_error → "App configuration error — please contact the owner"

## UAT tests still failing
- None (on main). Fix branch adds new behaviour — see below.

## UAT tests added / changed in fix branch
- **UI-1-T** (new): empty state shows 3 vertical suggestion chips; clicking one sends the message
- **UI-2-T** (new): quick-action bar always visible; 📷 triggers file picker, ☰ sends "Show my templates", 📊 sends "Show today's stats"
- **UI-3-T** (new): settings screen opens on ⚙ tap; targets form pre-fills from API; Save Targets calls setTargets; Sign Out clears session
- **UI-4-T** (new): ■ Stop button appears while AI is thinking; clicking it cancels the request and re-enables input
- **ERR-1-T** (updated): now also handles `data.error` from Apps Script — correct error text shown, not always "AI is unreachable"
- **F-4.x-T** (updated): stats card only rendered when `hasStats` is true (targets + consumed both present); no more empty 0/0 cards
- **F-3.3-T / F-3.5-T** (updated): after `updateTemplate` success the refreshed template list is shown immediately in chat

## What the next session needs to do
- **Merge fix branch → main** after device testing confirms all 6 fixes work end-to-end
- **Remove debug console.log calls** added in fix branch before merge (search for `[chat]`, `[getStats]`, `[buildSystemPrompt]`, `[executeAction]`, `[updateTemplate]`)
- **Run full Playwright UAT suite** against fix branch; update `tests/uat.test.js` to cover the 4 new UI-x-T scenarios
- **Deploy to production**: host on GitHub Pages or Firebase Hosting; set real `GOOGLE_CLIENT_ID`; strip test hooks

## Known issues / decisions
- `GOOGLE_CLIENT_ID` is still a placeholder — real Google sign-in requires an OAuth 2.0 client ID from Google Cloud Console (Authorised JavaScript origins must include the hosted URL)
- Service worker registered via Blob URL — works in Chrome/Chromium; SW intercepts only Apps Script fetches as network fallback, not asset caching
- Test hooks intentionally left in for now — must be removed before production deployment
- `parseClaudeResponse` uses a balanced-brace parser with string-escape awareness + code-block fallback; handles nested payloads safely
- Photo button queues one image per send; base64 image is NOT persisted to localStorage chat history (only text stored)
- Low-confidence photo edit card stays in chat history after save — renders again on reload but is inert (no pending action attached)
- **Fix branch only**: 6 `console.log` calls left in for debugging — remove before merging to main
- **Fix branch only**: settings screen `saveTargetsForm` checks `result.ok || result.success` — confirm Apps Script returns one of these fields on success
