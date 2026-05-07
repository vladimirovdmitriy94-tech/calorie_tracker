# Calorie Tracker — Progress

## Sessions completed
- Session 0 — Scaffolding: `index.html` created (login screen, chat screen, PWA manifest + SW, apiFetch helper, session management, chat history)
- Session 1 — Meal Logging: getStats → system prompt, action JSON parser, pending action flow, logMeal execution, post-save kcal totals, error banners, photo button
- Session 2 — Daily Stats: `renderStatsCard()`, `macroStatus()`, `isStatsQuery()` added; stats card injected on "show my stats"/"today's summary"/"how am I doing"; auto-refresh after logMeal/deleteMeal/updateMeal; `__mockStats` test hook

## UAT tests passing
- F-1.1-T: Login screen loads, Google button visible, no app content behind it
- F-1.2-T: Non-whitelisted email → "Access restricted — this app is private"
- F-1.4-T: Existing session in localStorage → skip login, show chat
- ERR-4-T: validateUser returns config_error → "App configuration error — please contact the owner"
- F-2.1-T A: "150g chicken breast, 100g rice, salad with olive oil" → nutritional breakdown shown
- F-2.1-T B: "a bowl of pasta" → Claude asks exactly ONE clarifying question
- F-2.2-T: Response includes kcal, protein, fat, carbs
- F-2.3-T (yes): Claude confirmation → yes → logMeal called → ID returned
- F-2.3-T (no): pending action → no → logMeal NOT called
- F-2.4-T A: "log my lunch: chicken, rice" → mealType = lunch in saved payload
- F-2.6-T: "what did I eat today?" → grouped summary shown, no raw JSON visible
- F-4.1-T: "show my stats" → "1400 / 2200 kcal" format shown in stats card
- F-4.2-T: protein, fat, carbs each show consumed/target (e.g. "95 / 150g")
- F-4.3-T: all 4 meal types shown in card even when snack = 0 kcal
- F-4.4-T: ⚠️ Slightly low at 64%, ✅ On track at 95%, 🔴 Over target at 113%
- F-4.5-T: After save → "You've now logged X kcal today — Y kcal remaining" appended
- ERR-1-T: Mock chat API down → error banner shown, typed message preserved in input
- ERR-2-T: Mock logMeal failure → "Meal estimated but couldn't be saved — tap to retry" banner

## UAT tests still failing
- None

## What the next session needs to do
- Add template fetch + confirmation flow: Claude calls `getTemplate`, shows ingredients + macros, user confirms → `logMeal` with `notes="from template: [name]"`
- Add partial override: "log breakfast without bread" → Claude recalculates macros → `logMeal` with modified note
- Add `updateTemplate` flow (only on explicit user request + confirmation) and `getTemplate` keyword/mealType query listing

## Known issues / decisions
- Service worker registered via Blob URL — works in Chrome, scope is limited; SW intercepts only Apps Script fetches as network fallback, not asset caching
- `GOOGLE_CLIENT_ID` is still a placeholder; real Google sign-in requires an OAuth 2.0 client ID configured in Google Cloud Console
- `window.__testLogin`, `window.__setSession`, `window.__mockChatFail`, `window.__mockLogMealFail`, `window.__mockStats`, `window.__setPendingAction` test hooks are intentionally left in; remove before production
- `parseClaudeResponse` regex (`[^}]*` for payload) handles flat JSON payloads only; nested objects in payload would silently drop the action — acceptable for current schema
- Photo button queues one image per send; base64 image is not persisted to localStorage chat history (only text is stored)
