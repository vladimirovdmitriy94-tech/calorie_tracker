# Calorie Tracker — Progress

## Sessions completed
- Session 0 — Scaffolding: `index.html` created (login screen, chat screen, PWA manifest + SW, apiFetch helper, session management, chat history)
- Session 1 — Meal Logging: getStats → system prompt, action JSON parser, pending action flow, logMeal execution, post-save kcal totals, error banners, photo button
- Session 2 — Daily Stats: `renderStatsCard()`, `macroStatus()`, `isStatsQuery()` added; stats card injected on "show my stats"/"today's summary"/"how am I doing"; auto-refresh after logMeal/deleteMeal/updateMeal; `__mockStats` test hook
- Session 3 — Meal Templates: templates fetched via `getTemplate` and injected into system prompt as `SAVED TEMPLATES:` block; TODAY section now includes full macros + ID per meal so Claude can copy exact values; `updateTemplate` action handled in `executeAction`; `parseClaudeResponse` upgraded to balanced-brace parser with string-escape awareness + code-block fallback; test hooks `__mockTemplate`, `__mockUpdateTemplate`, `__mockLogMeal`, `__mockChatResponse`, `__apiCallLog`, `__clearApiLog` added
- Session 4 — Targets: `setTargets` pending action flow added to `executeAction`; `isTargetsQuery()` detects "show my current targets" / "what are my macro goals"; `renderTargetsCard()` displays targets-only readable card; targets query intercept added to `sendMsg`; `__mockSetTargets` test hook added; system prompt updated with setTargets field names
- Session 5 — Edit & Delete: `deleteMeal` and `updateMeal` pending action flows added to `executeAction`; not-found handling for deleteMeal shows "No [mealType] logged today to delete" friendly message; distinct confirm messages per action type ("Meal deleted." / "Meal updated."); stats refresh after delete/edit; `__mockDeleteMeal` and `__mockUpdateMeal` test hooks added; system prompt updated with deleteMeal/updateMeal rules
- Session 6 — History, Export & Suggestions: export button added to header; `exportMealLog()` + `isExportQuery()` added; chat "export my meal log" intercept triggers CSV download; `clearChat()` now shows confirmation dialog ("Clear chat history? This won't affect your meal data.") before clearing; `showConfirm()`/`hideConfirm()`/`confirmOk()` modal added; `__mockExportData` test hook added
- Session 7 — Photo Parsing: `photoIncludedInMessage` flag tracks when photo is sent; `notes="logged from photo"` auto-injected into logMeal payload; `isLowConfidence()` detects uncertainty phrases; `showPhotoEditCard()` renders editable inline card (pe-name, pe-calories, pe-protein, pe-fat, pe-carbs) when low confidence detected; `confirmPhotoEdit()` reads edited values and executes logMeal; system prompt updated with photo analysis rules; `__setPendingPhoto` + `__showPhotoEditCard` test hooks added

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
- F-3.1-T: "add my breakfast" → template shown → confirm → logMeal called with `notes="from template: breakfast"`
- F-3.2-T: After logging from template → `updateTemplate` never called (Meal_Templates row unchanged)
- F-3.3-T: "update my breakfast template: 2 eggs" → confirm → `updateTemplate` called with new ingredients
- F-3.4-T: "log breakfast without bread" → `notes="modified from template: breakfast (without bread)"`, template unchanged
- F-3.5-T: "save as post-gym snack: banana, whey, milk" → `updateTemplate` called with `templateName="post-gym snack"`
- F-3.6-T: "save today's lunch as template 'my_lunch'" → `updateTemplate` called with exact calories/protein/fat/carbs from logged meal, Claude confirms
- F-3.7-T C: Template search with no matches → "No saved templates found for that search" shown
- F-5.1-T: "set my daily target: 2000 calories, 140g protein..." → setTargets called with correct payload, confirmation shown
- F-5.2-T: "set breakfast target to 450 kcal and lunch to 700 kcal" → setTargets called with breakfastCal/lunchCal
- F-5.3-T: mockStats with April targets → 1800 kcal shown; mockStats with January targets → 2200 kcal shown
- F-5.4-T: "show my current targets" → readable targets card, no raw JSON
- F-8.1-T A: "delete my breakfast" → shows "Will delete: Morning Oats, 430 kcal. Confirm?" → yes → "Meal deleted. You've now logged 0 kcal today — 2200 kcal remaining" + stats card refresh
- F-8.1-T B: "delete my dinner" (none logged) → "No dinner logged today to delete", no error banner, no pending action
- F-8.2-T: "change chicken to 200g in my lunch" → recalculated 720 kcal shown → yes → "Meal updated. You've now logged 720 kcal today — 1480 kcal remaining" + updateMeal called with correct payload + stats card refresh
- F-9.1-T: clear chat button → confirmation dialog shown → confirm → localStorage cleared, chat UI empty
- F-9.2-T: 5 messages seeded → reload → all 5 visible, history persisted
- F-9.3-T: export button + "export my meal log" chat command → Blob URL created, download="meals-export.csv" triggered
- F-7.1-T: "suggest a meal with chicken and eggs" → 3 suggestions each with kcal count, no raw JSON
- F-7.2-T: "suggest something under 500 kcal for dinner" → 3 options all ≤ 500 kcal (380, 420, 350)
- F-7.3-T: "I need a high protein low fat meal" → 3 options all protein > 30g and fat < 10g
- F-6.1-T: upload food photo → estimate shown → confirm → logMeal called with notes="logged from photo"
- F-6.2-T: product photo → nutritional info shown, serving size question asked, no raw JSON
- F-6.3-T: low-confidence photo → "not fully sure" text + editable card shown, edited values saved
- F-6.4-T: photo confirmation → mealType set (inferred), notes="logged from photo" in payload
- ERR-3-T: covered by F-6.3-T

## UAT tests still failing
- None

## What the next session needs to do
- Session 8 — Full UAT Run: run all 37 UAT tests (F-1.x through F-9.x + ERR-x) using Playwright, fix all failures, commit as v1.0

## Known issues / decisions
- Service worker registered via Blob URL — works in Chrome; scope is limited; SW intercepts only Apps Script fetches as network fallback, not asset caching
- `GOOGLE_CLIENT_ID` is still a placeholder; real Google sign-in requires an OAuth 2.0 client ID configured in Google Cloud Console
- Test hooks (`__testLogin`, `__setSession`, `__mockChatFail`, `__mockLogMealFail`, `__mockStats`, `__mockTemplate`, `__mockUpdateTemplate`, `__mockLogMeal`, `__mockDeleteMeal`, `__mockUpdateMeal`, `__mockChatResponse`, `__mockExportData`, `__apiCallLog`, `__setPendingAction`, `__setPendingPhoto`, `__showPhotoEditCard`) are intentionally left in; remove before production
- `parseClaudeResponse` now uses a balanced-brace parser with string-escape awareness + code-block fallback; handles nested payloads safely
- Photo button queues one image per send; base64 image is not persisted to localStorage chat history (only text is stored)
