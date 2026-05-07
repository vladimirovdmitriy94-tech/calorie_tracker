# Calorie Tracker — User Acceptance Tests
**Version:** 1.0  ·  **Format:** Given / When / Then  ·  **Linked PRD:** v1.0

Each test ID matches its feature ID (F-x.x-T).  
**Pass criteria:** all Then conditions met with no console errors.  
**Precondition for all tests unless stated:** user is authenticated as `owner@gmail.com`, today is a weekday in Milan (Europe/Rome), at least one meal is logged for today.

---

## Block 1 — Authentication

### F-1.1-T · Login Screen

**Given** the user opens the app URL for the first time (no existing session)  
**When** the login screen loads  
**Then:**
- A Google Sign-In button is visible
- No app content (chat, stats, nav) is accessible behind it
- The screen displays the app name and logo

---

### F-1.2-T · Email Whitelist Enforcement

**Test A — Allowed email**  
**Given** the user clicks Sign In and authenticates with `owner@gmail.com`  
**When** authentication completes  
**Then** the user is taken to the main chat screen

**Test B — Blocked email**  
**Given** the user clicks Sign In and authenticates with any email NOT in the `Users` sheet  
**When** authentication completes  
**Then:**
- The user remains on the login screen
- A clear message is shown: "Access restricted — this app is private"
- No app data is accessible

---

### F-1.4-T · Session Persistence

**Given** the user has successfully logged in previously  
**When** the user closes Safari and reopens the app (PWA from home screen)  
**Then:**
- The user lands directly on the chat screen — no login prompt
- Their name is displayed (from the session)
- Chat history from localStorage is restored

---

## Block 2 — Meal Logging

### F-2.1-T · Natural Language Meal Input

**Test A — Detailed input**  
**Given** the user is on the chat screen  
**When** the user types "150g chicken breast, 100g rice, salad with olive oil"  
**Then** Claude responds with a parsed breakdown listing each ingredient with estimated amounts

**Test B — Vague input (ambiguity handling)**  
**When** the user types "a bowl of pasta"  
**Then** Claude asks exactly one clarifying question about quantity or type — it does not guess and save

---

### F-2.2-T · Calorie + Macro Estimation

**Given** the user has typed a clear meal description  
**When** Claude returns its estimate  
**Then** the response includes:
- Total calories (kcal)
- Protein (g), Fat (g), Carbs (g)
- Optional: Fiber (g) if determinable
- Values are plausible (e.g. 150g chicken ≈ 165 kcal, 31g protein)

---

### F-2.3-T · Confirmation Before Saving

**Given** Claude has returned a meal estimate  
**When** the estimate is shown  
**Then:**
- Claude asks for explicit confirmation before saving ("Shall I log this?")
- If user says "yes" → meal is saved to Meals_Log, Claude confirms with the meal ID
- If user says "no" or "edit" → Claude does not save and waits for correction

---

### F-2.4-T · MealType Tagging

**Test A — Explicit type**  
**When** user types "log my lunch: 150g chicken, rice"  
**Then** the logged meal has `mealType = "lunch"`

**Test B — Type inferred from context**  
**When** user types "add breakfast: oats and milk" at 8am  
**Then** the logged meal has `mealType = "breakfast"`

**Test C — Type not determinable**  
**When** user types a meal with no type and ambiguous time  
**Then** Claude asks "Is this breakfast, lunch, dinner, or a snack?"

---

### F-2.5-T · Notes Field

**Given** user logs a meal  
**When** the user adds context like "log my lunch, restaurant estimate"  
**Then:**
- The Notes field in Meals_Log is populated with "restaurant estimate"
- The note is visible when the meal is retrieved in stats

---

### F-2.6-T · "What Did I Eat Today?" Query

**Given** at least 2 meals have been logged today  
**When** user types "what did I eat today?" or "show my meals today"  
**Then** Claude responds with a readable summary grouped by meal type, including meal names and calories per entry — no raw JSON shown to the user

---

## Block 3 — Meal Templates

### F-3.1-T · Load Template by Name

**Given** a template named "breakfast" exists for the user  
**When** user types "add my breakfast"  
**Then:**
- Claude fetches the template and shows the ingredients + macros
- Asks for confirmation before logging
- After confirmation, a new row is added to Meals_Log (template is NOT modified)

---

### F-3.2-T · Templates Are Immutable by Default

**Given** user logs template "breakfast" with confirmation  
**When** the meal is saved  
**Then:**
- Meals_Log has a new row with the template's values
- Meal_Templates row for "breakfast" is unchanged
- Meals_Log Notes field contains "from template: breakfast"

---

### F-3.3-T · Explicit Template Update

**Given** template "breakfast" exists with "3 eggs, 50g bread"  
**When** user types "update my breakfast template: 2 eggs instead of 3"  
**Then:**
- Claude confirms what will change
- After user confirms → Meal_Templates row is updated to "2 eggs, 50g bread"
- A subsequent getTemplate call returns the updated ingredients

---

### F-3.4-T · Partial Override on Log

**Given** template "breakfast" contains "3 eggs, 50g bread, apple"  
**When** user types "log breakfast without bread"  
**Then:**
- Claude estimates macros with bread removed
- The logged meal does NOT contain bread
- Meal_Templates is unchanged
- Notes field contains "modified from template: breakfast (without bread)"

---

### F-3.5-T · Create Template from Scratch

**When** user types "save this as my post-gym snack: 1 banana, 30g whey protein, 200ml milk"  
**Then:**
- Claude estimates macros and shows a summary
- After confirmation, a new row is added to Meal_Templates
- The template is retrievable by name "post-gym snack"

---

### F-3.6-T · Create Template from Logged Meal

**Given** meal with ID 5 was logged today as "chicken rice bowl"  
**When** user types "save today's lunch as a template called 'my_lunch'"  
**Then:**
- A new row is added to Meal_Templates with name "my_lunch" and the exact values from meal ID 5
- Claude confirms the template was saved

---

### F-3.7-T · Query Saved Templates

**Test A — By meal type**  
**When** user types "show my breakfast templates"  
**Then** Claude lists all templates where MealType = "breakfast" with names and calories

**Test B — By keyword**  
**When** user types "what saved meals have fish?"  
**Then** Claude lists all templates where Ingredients contains "fish"

**Test C — No results**  
**When** user searches for a keyword with no matches  
**Then** Claude says "No saved templates found for that search" — no error, no empty list shown raw

---

## Block 4 — Daily Stats

### F-4.1-T · Total Calories vs Target

**Given** the user has a daily calorie target set (e.g. 2200 kcal) and has logged meals totalling ~1400 kcal  
**When** user asks "show my stats" or "today's summary"  
**Then** the response shows "1400 / 2200 kcal" in a clear visual format

---

### F-4.2-T · Macros vs Targets

**Given** the user has macro targets set  
**When** the daily summary is shown  
**Then** protein, fat, and carbs are each shown as consumed/target (e.g. "85 / 150g protein")

---

### F-4.3-T · Per-Meal Breakdown

**Given** user has set per-meal calorie targets (e.g. breakfast 500 kcal) and logged breakfast  
**When** the daily summary is shown  
**Then** each meal type shows its own consumed vs target (even if 0 consumed)

---

### F-4.4-T · Status Indicators

**Given** daily summary is displayed  
**When** a metric is within ±10% of target  
**Then** it shows "✅ On track"  
**When** it is more than 10% below target  
**Then** it shows "⚠️ Slightly low"  
**When** it exceeds target  
**Then** it shows "🔴 Over target"

---

### F-4.5-T · Inline Stats After Logging

**Given** user logs a meal and confirms  
**When** the meal is saved  
**Then** Claude's confirmation message includes a one-line summary of today's running total (e.g. "You've now logged 1,340 kcal today — 860 remaining")

---

## Block 5 — Targets

### F-5.1-T · Set Daily Targets

**When** user types "set my daily target: 2000 calories, 140g protein, 65g fat, 230g carbs"  
**Then:**
- A new row is added to User_Targets with today's date as DateFrom
- Subsequent getStats calls use these new values
- Claude confirms the targets were saved

---

### F-5.2-T · Set Per-Meal Targets

**When** user types "set breakfast target to 450 kcal and lunch to 700 kcal"  
**Then** User_Targets BreakfastCal and LunchCal are updated for the active target row

---

### F-5.3-T · Date-Based Target Activation

**Given** two target rows exist: one from 2026-01-01 and one from 2026-04-01  
**When** getStats is called for a date after 2026-04-01  
**Then** the April target row values are used  
**When** getStats is called for a date in February  
**Then** the January target row values are used

---

### F-5.4-T · View Current Targets

**When** user types "show my current targets" or "what are my macros goals?"  
**Then** Claude displays the currently active targets for all fields in a readable format — no raw JSON

---

## Block 6 — Photo Parsing

### F-6.1-T · Meal Photo → Macro Estimate

**Given** user taps the photo button and uploads a clear photo of a meal  
**When** Claude processes the image  
**Then:**
- Claude describes the estimated ingredients
- Provides a calorie + macro estimate
- Asks for confirmation before logging

---

### F-6.2-T · Product Photo → Macro Info

**When** user uploads a photo of a food product (e.g. yogurt tub label)  
**Then** Claude reads or estimates the nutritional info per serving and confirms the serving size with the user

---

### F-6.3-T · Low-Confidence Warning

**Given** the photo is blurry, partially obscured, or shows an unfamiliar dish  
**When** Claude returns an estimate  
**Then:**
- Claude explicitly flags uncertainty ("I'm not fully sure about the portions")
- All estimated fields are shown as editable before confirmation
- User can correct individual values before saving

---

### F-6.4-T · Photo Confirmation Before Saving

**Given** a photo has been parsed and the estimate shown  
**When** user confirms  
**Then** the meal is logged with MealType set (inferred or asked) and Notes = "logged from photo"

---

## Block 7 — Meal Suggestions

### F-7.1-T · Suggest by Ingredients

**When** user types "suggest a meal with chicken and eggs"  
**Then** Claude provides 2–3 meal suggestions that include both ingredients, with approximate calorie counts

---

### F-7.2-T · Suggest by Calorie Budget

**When** user types "suggest something under 500 kcal for dinner"  
**Then** Claude provides suggestions with calories ≤ 500 kcal, appropriate for dinner

---

### F-7.3-T · Suggest by Macro Profile

**When** user types "I need a high protein low fat meal"  
**Then** Claude provides suggestions with protein > 30g and fat < 10g per serving (approximate), with macros stated

---

## Block 8 — Edit & Delete

### F-8.1-T · Delete a Meal

**Test A — Delete by type**  
**Given** breakfast has been logged today (meal ID 3)  
**When** user types "delete my breakfast"  
**Then:**
- Claude shows what will be deleted: name + calories ("Morning Oats, 430 kcal")
- After confirmation → row is deleted from Meals_Log
- Claude confirms deletion and shows updated daily total

**Test B — Delete non-existent meal**  
**When** user types "delete my dinner" and no dinner has been logged  
**Then** Claude responds "No dinner logged today to delete" — no error thrown

---

### F-8.2-T · Edit a Meal

**Given** lunch (meal ID 2) was logged with 150g chicken  
**When** user types "change chicken to 200g in my lunch"  
**Then:**
- Claude recalculates the macros for 200g chicken
- Shows the updated values and asks for confirmation
- After confirmation → updateMeal updates the row, Claude confirms the change

---

## Block 9 — History & Export

### F-9.1-T · Clear Chat History

**Given** the user has a conversation history visible in the chat  
**When** user taps the "Clear chat" button and confirms  
**Then:**
- The chat screen is empty
- localStorage chat history is cleared
- Meals_Log in Google Sheets is NOT affected

---

### F-9.2-T · Chat History Persistence

**Given** the user had a conversation with 5 messages  
**When** the user closes Safari and reopens the app  
**Then:**
- The 5 messages are still visible in the chat
- Sending a new message continues the conversation naturally

**Note:** localStorage persists across sessions — it is only cleared on explicit "Clear chat" action or if the user manually clears Safari website data.

---

### F-9.3-T · Data Export

**When** user types "export my meal log" or taps the export button  
**Then:**
- A CSV file download is triggered in Safari
- The file contains all logged meals for the authenticated user
- Columns: Date, MealType, Name, Ingredients, Calories, Protein, Fat, Carbs, Fiber, Notes
- No other user's data is included

---

## Error Handling Tests

### ERR-1-T · Claude API Failure

**Given** the Anthropic API is unreachable (network error or timeout)  
**When** the user sends a message  
**Then:**
- An inline error banner appears: "AI is unreachable — please try again"
- A Retry button is shown
- The user's typed message is NOT lost
- No crash occurs

---

### ERR-2-T · Apps Script Save Failure

**Given** Claude has estimated a meal and the user confirms  
**When** the Apps Script call fails (timeout or server error)  
**Then:**
- An error message is shown: "Meal estimated but couldn't be saved — tap to retry"
- The estimated data is still displayed so user can retry without re-describing the meal

---

### ERR-3-T · Photo Parsing Low Confidence (see F-6.3-T)

Already covered above.

---

### ERR-4-T · Missing API Key (Config Error)

**Given** ANTHROPIC_API_KEY has not been set in Script Properties  
**When** the user sends any message  
**Then** a clear setup error is shown (does not expose the missing key or internal paths)

---

## Block UI — UI Enhancements (fix branch)

### UI-1-T · Suggestion chips in empty state

**Given** the user has just signed in with no chat history  
**When** the chat empty state is shown  
**Then:**
- Three vertical suggestion chips appear under the welcome message
- Clicking a chip fills the input and submits the message immediately
- The empty state hides after the first message is sent

### UI-2-T · Quick-action pill bar

**Given** the chat screen is open  
**When** the user taps the bottom pill bar (📷 Photo / ☰ Templates / 📊 Today's Stats)  
**Then:**
- 📷 opens the file picker for photo upload
- ☰ sends "Show my templates" → templates list rendered as styled card
- 📊 sends "Show today's stats" → stats card rendered

### UI-3-T · Settings screen — daily targets editor

**Given** the user opens Settings via the ⚙ button  
**When** the settings screen loads  
**Then:**
- The 8 target fields (calories, protein, carbs, fat, fiber, breakfastCal, lunchCal, dinnerCal) are pre-filled from the latest `User_Targets` row (filtered by user email + DateFrom ≤ today)
- Editing a field and tapping Save Targets calls `setTargets` with all 8 fields included
- Button shows "✓ Saved!" on success
- On failure, an inline `#settings-error` message is shown — no error appears in the chat banner

### UI-4-T · Stop button while AI is thinking

**Given** the user has just sent a message and the AI is processing  
**When** the typing indicator is visible  
**Then:**
- The send button is hidden and a red ■ Stop button appears
- Tapping Stop aborts the in-flight request
- The send button returns and the input is re-enabled

---

## Block TPLR — Template Rendering

### TPLR-1-T · "Show my templates" rendered as styled card, not raw HTML

**Given** the user has saved templates and types "show my templates"  
**When** the templates query intercept fires  
**Then:**
- A styled `.templates-list` card is rendered (one `.template-card` per template)
- Raw HTML markup like `<div class="templates-grid">` does NOT appear as visible text
- Claude is NOT called for this query (verified by no `chat` action in API log)

### TPLR-2-T · Template card content

**Given** a template card is being rendered  
**When** the card is displayed  
**Then** each card shows:
- Template name (e.g. "paradise")
- Meal-type emoji + label (🌅 breakfast, ☀️ lunch, 🌙 dinner, 🍎 snack)
- Ingredients string
- Four macro pills: kcal, P:Xg, F:Xg, C:Xg

### TPLR-3-T · Empty template list

**Given** the user has no saved templates  
**When** they ask "show my templates"  
**Then** the card displays "No templates saved yet" with a hint about how to create one

---

## Block NORM — API Response Normalisation

### NORM-1-T · Real API getStats format renders correctly

**Given** the Apps Script `getStats` returns `{ totals: { calories: N }, targets: {...}, meals: [...] }`  
(real API uses `totals.calories`, not `consumed`; meal keys are TitleCase: `MealType`, `Calories`)  
**When** the stats card is rendered  
**Then:**
- `consumed` is taken from `totals.calories`
- Meal-type breakdown shows meals from TitleCase rows (`MealType` → `mealType`)
- All macro totals match the sheet data

### NORM-2-T · Real API deleteMeal response

**Given** Apps Script returns `{ success: true, deleted: {...} }` for a successful delete (no `ok` field)  
**When** the user confirms the delete  
**Then:**
- "Meal deleted" confirmation is shown
- The "No X logged today to delete" message is NOT shown (the previous bug where `!result.ok` was always true is fixed)

### NORM-3-T · Template keys normalised TitleCase → camelCase

**Given** Apps Script returns templates with TitleCase keys (`TemplateName`, `Calories`, …)  
**When** `normalizeTemplates()` runs  
**Then** the resulting objects have lowercase keys (`templateName`, `calories`, …) — both the system prompt and the template card render correctly

### NORM-4-T · normalizeStats does not overwrite existing consumed

**Given** stats already has `consumed: 1400` (mock format)  
**When** `normalizeStats()` runs even with `totals.calories: 9999` also present  
**Then** `consumed` remains 1400 (only fills `consumed` when it is undefined)

---

## Block CONFIRM — Action Confirmation Messages

### CONFIRM-1-T · logMeal confirmation shown immediately

**Given** the user confirms a logMeal action  
**When** Apps Script returns `{ success: true, id }`  
**Then:**
- A confirmation message "✅ Done — Meal logged to today's log!" appears with the meal ID
- The message is shown BEFORE the post-action `getStats` call (independent of stats refresh)

### CONFIRM-2-T · Confirmation shown even if stats refresh fails

**Given** logMeal succeeded but the post-action `getStats` call fails  
**When** the user views the chat  
**Then:**
- The "✅ Done — Meal logged" confirmation is still visible
- No error banner is shown for the stats failure (handled silently)

### CONFIRM-3-T · Kcal totals shown as separate follow-up message

**Given** logMeal succeeded and stats refresh returned valid data  
**When** the chat shows the post-action messages  
**Then:**
- First message: "✅ Done — Meal logged to today's log!"
- Second message: "You've now logged X kcal today — Y kcal remaining"
- Third message: stats card with the just-logged meal visible in the meals breakdown

### CONFIRM-4-T · Real API response format triggers confirmation

**Given** Apps Script returns `{ success: true, id: N, date: "yyyy-mm-dd" }` (no `ok` field)  
**When** the client checks the response  
**Then** the error path is NOT taken (fixed: now checks `!result.ok && !result.success && !result.id`); the success confirmation appears

---

## Block STG — Settings Real-API Integration

### STG-1-T · Settings: targets pre-fill from real getStats response

**Given** the user opens Settings  
**When** `getStats` returns the latest target row from `User_Targets`  
**Then** all 8 form fields (calories, protein, carbs, fat, fiber, breakfastCal, lunchCal, dinnerCal) are pre-filled with the values from the matched row

### STG-2-T · Settings: setTargets sends all 8 fields

**Given** the user fills only some target fields and saves  
**When** `setTargets` is called  
**Then:**
- All 8 fields are present in the request body (empty inputs become `0`, never `undefined`)
- This prevents the server from silently zeroing out fields that were not in the payload

### STG-3-T · Stats card targets reflect User_Targets row

**Given** the latest `User_Targets` row for the user has `calories: 2200`  
**When** the user asks "show my stats" with no meals logged today  
**Then** the stats card shows `0 / 2200 kcal` (target from User_Targets, consumed=0 from empty Meals_Log)

---

## Block API — Apps Script date-handling fix (server-side)

### API-1-T · Date filter handles Date objects from Sheets

**Given** Google Sheets stores values in date-formatted columns as Date objects (default behaviour)  
**When** `getStats` filters `Meals_Log` by `Date === requestedDate`  
**Then** the `dateOnly()` helper formats the Date object back to "yyyy-MM-dd" before comparison — meals on the requested date are matched correctly

### API-2-T · User_Targets row matched correctly

**Given** the `User_Targets` sheet has rows with `DateFrom` stored as Date objects  
**When** `getStats` selects the latest row with `DateFrom <= requestedDate`  
**Then** the comparison works correctly (using `dateOnly(r.DateFrom) <= date`) and the latest row is returned

### API-3-T · setTargets upsert finds existing row by date

**Given** the user already has a `User_Targets` row for today  
**When** they save targets again from Settings  
**Then** the existing row is updated (upsert), not appended as a duplicate

---

*End of UAT document — 37 test scenarios across 9 feature blocks + 4 error handling tests*
