// ============================================================
//  CALORIE TRACKER — Web App API  v2.0
//  Deploy → New deployment → Web App → "Anyone" access
// ============================================================
//
//  SETUP REQUIRED:
//  1. In Apps Script → Project Settings → Script Properties
//     Add property: ANTHROPIC_API_KEY = sk-ant-...
//  2. Set SHEET_ID below to your Google Sheet ID
//
// ============================================================

const SHEET_ID    = "1PAZ8fyRX-0nw3pTsxcv9d99eki32K9Di_1Jg9g8EDj4";
const TIMEZONE    = "Europe/Rome";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";


// ── Router ───────────────────────────────────────────────────

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    const routes = {
      logMeal:        () => logMeal(body),
      getStats:       () => getStats(body),
      getTemplate:    () => getTemplate(body),
      updateTemplate: () => updateTemplate(body),
      setTargets:     () => setTargets(body),
      deleteMeal:     () => deleteMeal(body),
      updateMeal:     () => updateMeal(body),
      chat:           () => chat(body),         // Claude API proxy
      getLog:         () => getLog(body),        // Full log / date range
      exportData:     () => exportData(body),    // CSV export
    };

    if (!routes[action]) return respond({ error: "Unknown action: " + action });
    return respond(routes[action]());

  } catch (err) {
    return respond({ error: err.message });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "getStats")     return respond(getStats(e.parameter));
  if (action === "validateUser") return respond(validateUser(e.parameter));
  return respond({ status: "Calorie Tracker API is running ✅" });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Helpers ──────────────────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );
}

function nextId(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 1;
  const ids = data.slice(1).map(r => Number(r[0])).filter(n => !isNaN(n) && n > 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// Always returns today in Europe/Rome — used as server-side fallback only.
// Clients should always send their local date explicitly in body.date.
function today() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
}

// Normalises any cell/body date value to "yyyy-MM-dd" string for comparison.
// Google Sheets returns Date objects from date-formatted columns — String(dateObj)
// gives a locale string like "Fri May 08 2026..." which breaks naive comparisons.
function dateOnly(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE, "yyyy-MM-dd");
  }
  return String(val).substring(0, 10);
}

// Validates and normalises userEmail — required on every data endpoint.
function requireEmail(body) {
  const email = String(body.userEmail || "").toLowerCase().trim();
  if (!email) throw new Error("userEmail is required");
  return email;
}

// Header-safe column accessor — avoids hardcoded indices breaking on schema changes.
function colFn(headers) {
  return (name) => headers.indexOf(name);
}


// ── 0. validateUser ──────────────────────────────────────────
// Called once after Google Sign-In to check if email is whitelisted.
// GET ?action=validateUser&email=user@gmail.com

function validateUser(body) {
  const email = String(body.email || "").toLowerCase().trim();
  if (!email) return { allowed: false, error: "No email provided" };

  const rows = sheetToObjects(getSheet("Users"));
  const user = rows.find(r =>
    String(r.Email).toLowerCase().trim() === email &&
    r.Active === true
  );

  if (!user) return { allowed: false };
  return { allowed: true, name: user.Name, role: user.Role };
}


// ── 1. logMeal ───────────────────────────────────────────────
// Body: {
//   action, userEmail, date?,
//   mealType, name, ingredients,
//   calories, protein, fat, carbs, fiber?, notes?
// }

function logMeal(body) {
  const userEmail = requireEmail(body);
  const sheet = getSheet("Meals_Log");
  const id = nextId(sheet);
  const date = body.date || today();

  sheet.appendRow([
    id,
    date,
    userEmail,
    body.mealType    || "",
    body.name        || "",
    body.ingredients || "",
    Number(body.calories) || 0,
    Number(body.protein)  || 0,
    Number(body.fat)      || 0,
    Number(body.carbs)    || 0,
    Number(body.fiber)    || 0,
    body.notes       || ""
  ]);

  return { success: true, id, date };
}


// ── 2. getStats ──────────────────────────────────────────────
// Body: { action, userEmail, date? }
// Returns: totals, per-meal breakdown, active targets, and full meal list for the day.

function getStats(body) {
  const userEmail = requireEmail(body);
  const date = body.date || today();

  const meals = sheetToObjects(getSheet("Meals_Log"))
    .filter(r =>
      dateOnly(r.Date) === date &&
      String(r.UserEmail).toLowerCase().trim() === userEmail
    );

  const sum = (field) => meals.reduce((a, r) => a + (Number(r[field]) || 0), 0);

  const totals = {
    calories: sum("Calories"),
    protein:  sum("Protein"),
    fat:      sum("Fat"),
    carbs:    sum("Carbs"),
    fiber:    sum("Fiber"),
    byMeal:   {}
  };

  ["breakfast", "lunch", "dinner", "snack"].forEach(type => {
    const typeMeals = meals.filter(r => r.MealType === type);
    totals.byMeal[type] = {
      calories: typeMeals.reduce((a, r) => a + (Number(r.Calories) || 0), 0),
      items: typeMeals.map(r => ({
        id:       r.ID,
        name:     r.Name,
        calories: Number(r.Calories) || 0,
        protein:  Number(r.Protein)  || 0,
        fat:      Number(r.Fat)      || 0,
        carbs:    Number(r.Carbs)    || 0
      }))
    };
  });

  // Get latest active target for this user on or before the requested date
  const targetRows = sheetToObjects(getSheet("User_Targets"))
    .filter(r =>
      String(r.UserEmail).toLowerCase().trim() === userEmail &&
      dateOnly(r.DateFrom) <= date
    )
    .sort((a, b) => (dateOnly(b.DateFrom) > dateOnly(a.DateFrom) ? 1 : -1));

  const target = targetRows[0] || {};

  return {
    date,
    userEmail,
    totals,
    targets: {
      calories:     Number(target.Calories)     || null,
      protein:      Number(target.Protein)      || null,
      fat:          Number(target.Fat)          || null,
      carbs:        Number(target.Carbs)        || null,
      fiber:        Number(target.Fiber)        || null,
      breakfastCal: Number(target.BreakfastCal) || null,
      lunchCal:     Number(target.LunchCal)     || null,
      dinnerCal:    Number(target.DinnerCal)    || null,
    },
    meals  // Full list — used by "what did I eat today?" and inline stats
  };
}


// ── 3. getTemplate ───────────────────────────────────────────
// Supports: exact name match | mealType filter | keyword search | list all
// Body: { action, userEmail, templateName? | mealType? | keyword? }
// Always returns an array of templates.

function getTemplate(body) {
  const userEmail = requireEmail(body);
  let rows = sheetToObjects(getSheet("Meal_Templates"))
    .filter(r => String(r.UserEmail).toLowerCase().trim() === userEmail);

  // Priority 1: exact name match
  if (body.templateName) {
    const name = body.templateName.toLowerCase().trim();
    const match = rows.find(r => r.TemplateName.toLowerCase().trim() === name);
    return match
      ? { found: true,  templates: [match], count: 1 }
      : { found: false, templates: [],      count: 0, templateName: name };
  }

  // Priority 2: filter by meal type
  if (body.mealType) {
    rows = rows.filter(r => r.MealType.toLowerCase() === body.mealType.toLowerCase());
  }

  // Priority 3: keyword search in name or ingredients
  if (body.keyword) {
    const kw = body.keyword.toLowerCase();
    rows = rows.filter(r =>
      r.TemplateName.toLowerCase().includes(kw) ||
      r.Ingredients.toLowerCase().includes(kw)
    );
  }

  return { found: rows.length > 0, templates: rows, count: rows.length };
}


// ── 4. updateTemplate ────────────────────────────────────────
// Creates template if not found; updates if found. Scoped to userEmail.
// Body: { action, userEmail, templateName, mealType?, ingredients?, calories?, protein?, fat?, carbs? }

function updateTemplate(body) {
  const userEmail = requireEmail(body);
  const sheet = getSheet("Meal_Templates");
  const name = (body.templateName || "").toLowerCase().trim();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = colFn(headers);

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][col("UserEmail")]).toLowerCase().trim();
    const rowName  = String(data[i][col("TemplateName")]).toLowerCase().trim();

    if (rowEmail === userEmail && rowName === name) {
      const fields = {
        Ingredients: body.ingredients,
        Calories:    body.calories    !== undefined ? Number(body.calories) : undefined,
        Protein:     body.protein     !== undefined ? Number(body.protein)  : undefined,
        Fat:         body.fat         !== undefined ? Number(body.fat)      : undefined,
        Carbs:       body.carbs       !== undefined ? Number(body.carbs)    : undefined,
      };
      headers.forEach((h, c) => {
        if (fields[h] !== undefined && fields[h] !== null)
          sheet.getRange(i + 1, c + 1).setValue(fields[h]);
      });
      return { success: true, updated: name };
    }
  }

  // Not found — create new template
  sheet.appendRow([
    body.templateName,
    userEmail,
    body.mealType    || "",
    body.ingredients || "",
    Number(body.calories) || 0,
    Number(body.protein)  || 0,
    Number(body.fat)      || 0,
    Number(body.carbs)    || 0
  ]);
  return { success: true, created: name };
}


// ── 5. setTargets ────────────────────────────────────────────
// Upserts: updates existing row if same user + dateFrom, otherwise inserts.
// Body: { action, userEmail, dateFrom?, calories, protein, fat, carbs, fiber?, breakfastCal?, lunchCal?, dinnerCal? }

function setTargets(body) {
  const userEmail = requireEmail(body);
  const sheet = getSheet("User_Targets");
  const dateFrom = body.dateFrom || today();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = colFn(headers);

  const newValues = {
    Calories:     Number(body.calories)     || 0,
    Protein:      Number(body.protein)      || 0,
    Fat:          Number(body.fat)          || 0,
    Carbs:        Number(body.carbs)        || 0,
    Fiber:        Number(body.fiber)        || 0,
    BreakfastCal: Number(body.breakfastCal) || 0,
    LunchCal:     Number(body.lunchCal)     || 0,
    DinnerCal:    Number(body.dinnerCal)    || 0,
  };

  // Upsert: find existing row for this user + date
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][col("UserEmail")]).toLowerCase().trim();
    const rowDate  = dateOnly(data[i][col("DateFrom")]);
    if (rowEmail === userEmail && rowDate === dateFrom) {
      headers.forEach((h, c) => {
        if (newValues[h] !== undefined) sheet.getRange(i + 1, c + 1).setValue(newValues[h]);
      });
      return { success: true, updated: true, dateFrom };
    }
  }

  // Insert new row
  sheet.appendRow([
    dateFrom, userEmail,
    newValues.Calories, newValues.Protein, newValues.Fat, newValues.Carbs, newValues.Fiber,
    newValues.BreakfastCal, newValues.LunchCal, newValues.DinnerCal
  ]);
  return { success: true, created: true, dateFrom };
}


// ── 6. deleteMeal ────────────────────────────────────────────
// Body: { action, userEmail, id }  OR  { action, userEmail, date?, mealType }
// Returns deleted meal details so UI can confirm to the user what was removed.

function deleteMeal(body) {
  const userEmail = requireEmail(body);
  const sheet = getSheet("Meals_Log");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = colFn(headers);

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row[col("UserEmail")]).toLowerCase().trim() !== userEmail) continue;

    const matchById   = body.id &&
                        String(row[col("ID")]) === String(body.id);
    const matchByType = body.mealType &&
                        dateOnly(row[col("Date")]) === (body.date || today()) &&
                        String(row[col("MealType")]).toLowerCase() === body.mealType.toLowerCase();

    if (matchById || matchByType) {
      const deleted = {
        id:       row[col("ID")],
        name:     row[col("Name")],
        mealType: row[col("MealType")],
        calories: row[col("Calories")]
      };
      sheet.deleteRow(i + 1);
      return { success: true, deleted };
    }
  }

  return { success: false, error: "Meal not found" };
}


// ── 7. updateMeal ────────────────────────────────────────────
// Body: { action, userEmail, id, name?, ingredients?, calories?, protein?, fat?, carbs?, fiber?, notes? }

function updateMeal(body) {
  const userEmail = requireEmail(body);
  const sheet = getSheet("Meals_Log");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = colFn(headers);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[col("ID")]) === String(body.id) &&
        String(row[col("UserEmail")]).toLowerCase().trim() === userEmail) {

      const fields = {
        Name:        body.name,
        Ingredients: body.ingredients,
        Calories:    body.calories    !== undefined ? Number(body.calories) : undefined,
        Protein:     body.protein     !== undefined ? Number(body.protein)  : undefined,
        Fat:         body.fat         !== undefined ? Number(body.fat)      : undefined,
        Carbs:       body.carbs       !== undefined ? Number(body.carbs)    : undefined,
        Fiber:       body.fiber       !== undefined ? Number(body.fiber)    : undefined,
        Notes:       body.notes
      };

      headers.forEach((h, c) => {
        if (fields[h] !== undefined && fields[h] !== null)
          sheet.getRange(i + 1, c + 1).setValue(fields[h]);
      });
      return { success: true, updated: body.id };
    }
  }

  return { success: false, error: "Meal ID not found or access denied" };
}


// ── 8. chat — Claude API proxy ────────────────────────────────
// The Anthropic API key NEVER leaves the server. Stored in Script Properties.
//
// Body: {
//   action, userEmail,
//   messages: [{ role: "user"|"assistant", content: "..." }],
//   systemPrompt?: "..."   ← built by client: includes user name, today's date, active targets
// }
//
// Error handling:
//   - Missing API key    → config error message
//   - Claude API error   → error.type + error.message returned to client
//   - Network/timeout    → caught and returned as error string
//   - UrlFetch timeout   → 60s default (sufficient; Claude p50 latency ~2-5s)

function chat(body) {
  requireEmail(body);  // Validate user even for chat
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return { error: "ANTHROPIC_API_KEY not set in Script Properties.", type: "config_error" };
  }

  const payload = {
    model:      CLAUDE_MODEL,
    max_tokens: 1024,
    system:     body.systemPrompt || "",
    messages:   body.messages     || []
  };

  try {
    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method:           "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01"
      },
      payload:           JSON.stringify(payload),
      muteHttpExceptions: true
      // UrlFetchApp default timeout: 60 seconds — no configuration needed
    });

    const result = JSON.parse(response.getContentText());

    if (result.error) {
      return { error: result.error.message, type: result.error.type };
    }

    return {
      reply: result.content[0].text,
      usage: {
        inputTokens:  result.usage.input_tokens,
        outputTokens: result.usage.output_tokens
      }
    };

  } catch (err) {
    // Network failure, DNS error, or UrlFetch timeout
    return { error: "Claude API unreachable: " + err.message, type: "network_error" };
  }
}


// ── 9. getLog ─────────────────────────────────────────────────
// Returns meal entries for a user filtered by date or date range.
// Used by: "what did I eat today?" (F-2.6) and data export (F-9.3).
//
// Body: { action, userEmail, date? }
//   OR  { action, userEmail, dateFrom?, dateTo? }

function getLog(body) {
  const userEmail = requireEmail(body);
  let rows = sheetToObjects(getSheet("Meals_Log"))
    .filter(r => String(r.UserEmail).toLowerCase().trim() === userEmail);

  if (body.date) {
    rows = rows.filter(r => dateOnly(r.Date) === body.date);
  } else if (body.dateFrom || body.dateTo) {
    if (body.dateFrom) rows = rows.filter(r => dateOnly(r.Date) >= body.dateFrom);
    if (body.dateTo)   rows = rows.filter(r => dateOnly(r.Date) <= body.dateTo);
  }

  // Sort by date ascending, then by ID
  rows.sort((a, b) => {
    const da = dateOnly(a.Date), db = dateOnly(b.Date);
    if (da !== db) return da > db ? 1 : -1;
    return Number(a.ID) - Number(b.ID);
  });

  return { meals: rows, count: rows.length };
}


// ── 10. exportData ───────────────────────────────────────────
// Returns full meal log for a user as CSV string.
// Used by: Data export feature (F-9.3).
//
// Body: { action, userEmail, dateFrom?, dateTo? }

function exportData(body) {
  const userEmail = requireEmail(body);
  let rows = sheetToObjects(getSheet("Meals_Log"))
    .filter(r => String(r.UserEmail).toLowerCase().trim() === userEmail);

  if (body.dateFrom) rows = rows.filter(r => dateOnly(r.Date) >= body.dateFrom);
  if (body.dateTo)   rows = rows.filter(r => dateOnly(r.Date) <= body.dateTo);

  rows.sort((a, b) => dateOnly(a.Date) > dateOnly(b.Date) ? 1 : -1);

  const headers = ["Date", "MealType", "Name", "Ingredients", "Calories", "Protein", "Fat", "Carbs", "Fiber", "Notes"];
  const escapeCSV = (val) => `"${String(val || "").replace(/"/g, '""')}"`;

  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escapeCSV(r[h])).join(","))
  ].join("\n");

  return { csv, rows: rows.length, dateFrom: body.dateFrom || null, dateTo: body.dateTo || null };
}
