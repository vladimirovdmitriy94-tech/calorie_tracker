'use strict';
const { test, expect } = require('@playwright/test');
const {
  MOCK_STATS, MOCK_STATS_EMPTY,
  loginAs, setMockStats, setMockChat, clearMockChat,
  sendMessage, waitForAiText,
  clearApiLog, getLastApiCall, wasApiCalled,
} = require('./helpers');

const API_URL_PATTERN = '**/macros/s/**';

// ─────────────────────────────────────────────────────────────────────────────
// Block 1 — Authentication
// ─────────────────────────────────────────────────────────────────────────────

test('F-1.1-T · Login screen visible on first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-screen')).not.toHaveClass(/hidden/);
  await expect(page.locator('#chat-screen')).toHaveClass(/hidden/);
  await expect(page.locator('#btn-google')).toBeVisible();
  await expect(page.locator('.login-logo h1')).toBeVisible();
});

test('F-1.2-T · Blocked email → Access restricted message', async ({ page }) => {
  // Intercept validateUser GET → not whitelisted
  await page.route(API_URL_PATTERN, (route, req) => {
    if (req.url().includes('validateUser')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    }
    route.continue();
  });
  await page.goto('/');
  // Call processLogin via test hook
  await page.evaluate(() => window.__testLogin('blocked@example.com', 'Blocked'));
  await expect(page.locator('#login-alert')).toHaveClass(/show/, { timeout: 5000 });
  const msg = await page.locator('#alert-msg').textContent();
  expect(msg).toContain('Access restricted');
  await expect(page.locator('#chat-screen')).toHaveClass(/hidden/);
});

test('F-1.4-T · Existing session → skip login, show chat', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('ct_session', JSON.stringify({ email: 'owner@gmail.com', name: 'Owner' }));
    // Seed 2 chat messages
    localStorage.setItem('ct_chat_history', JSON.stringify([
      { role: 'user', content: 'Hello', time: '10:00' },
      { role: 'ai',   content: 'Hi there!', time: '10:00' }
    ]));
  });
  await page.reload();
  await page.waitForSelector('#chat-screen:not(.hidden)', { timeout: 5000 });
  await expect(page.locator('#login-screen')).toHaveClass(/hidden/);
  // Name shown in header
  await expect(page.locator('.hdr-name')).toBeVisible();
  // Chat history restored
  await expect(page.locator('.bubble.user').first()).toContainText('Hello');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 2 — Meal Logging
// ─────────────────────────────────────────────────────────────────────────────

test('F-2.1-T A · Detailed meal input → ingredient breakdown', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Here is the nutritional breakdown:\n' +
    '- 150g chicken breast: ~165 kcal, 31g protein, 3.5g fat, 0g carbs\n' +
    '- 100g white rice: ~130 kcal, 2.7g protein, 0.3g fat, 28g carbs\n' +
    '- Salad with olive oil: ~80 kcal, 1g protein, 7g fat, 4g carbs\n' +
    'Total: ~375 kcal | P:35g F:11g C:32g\n' +
    'Shall I log this?'
  );
  await sendMessage(page, '150g chicken breast, 100g rice, salad with olive oil');
  await waitForAiText(page, 'chicken breast');
  await waitForAiText(page, 'kcal');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toContain('chicken breast');
  expect(last).toContain('kcal');
  expect(last).toContain('protein');
});

test('F-2.1-T B · Vague input → single clarifying question', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page, 'Could you tell me how large the bowl was — roughly 200g, 300g, or more?');
  await sendMessage(page, 'a bowl of pasta');
  await waitForAiText(page, '?');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  // Should be a question
  expect(last).toContain('?');
  // Should NOT contain raw JSON
  expect(last).not.toContain('"action"');
});

test('F-2.2-T · Macro estimation includes kcal, protein, fat, carbs', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Estimated: 520 kcal | Protein: 38g | Fat: 14g | Carbs: 55g\nShall I log this?'
  );
  await sendMessage(page, '200g salmon with vegetables');
  await waitForAiText(page, 'kcal');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toMatch(/kcal/i);
  expect(last).toMatch(/protein/i);
  expect(last).toMatch(/fat/i);
  expect(last).toMatch(/carb/i);
});

test('F-2.3-T yes · Confirmation "yes" → logMeal called, ID returned', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  // Claude responds with action JSON
  await setMockChat(page,
    'Sounds good! Ready to log: 500 kcal, 40g protein. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken Rice","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'meal_001' }; });
  await clearApiLog(page);

  await sendMessage(page, '150g chicken and rice for lunch');
  await waitForAiText(page, 'Shall I log this?');

  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.mealType).toBe('lunch');
});

test('F-2.3-T no · "no" → logMeal NOT called', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready to log 480 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"dinner","name":"Pasta","calories":480,"protein":15,"fat":8,"carbs":80}}'
  );
  await clearApiLog(page);
  await sendMessage(page, 'pasta for dinner');
  await waitForAiText(page, 'Shall I log this?');

  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'no');
  await page.waitForTimeout(800);

  const called = await wasApiCalled(page, 'logMeal');
  expect(called).toBe(false);
});

test('F-2.4-T A · Explicit mealType "lunch" preserved in payload', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Got it — lunch: 150g chicken and rice.\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken and Rice","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'ml_a' }; });
  await clearApiLog(page);

  await sendMessage(page, 'log my lunch: 150g chicken, rice');
  await waitForAiText(page, 'Got it');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call.body.mealType).toBe('lunch');
});

test('F-2.5-T · Notes field populated with context', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Logging your lunch with a restaurant estimate note.\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Restaurant Meal","calories":650,"protein":35,"fat":20,"carbs":70,"notes":"restaurant estimate"}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'ml_b' }; });
  await clearApiLog(page);

  await sendMessage(page, 'log my lunch, restaurant estimate');
  await waitForAiText(page, 'restaurant estimate');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.notes).toContain('restaurant estimate');
});

test('F-2.6-T · "What did I eat?" → readable summary, no raw JSON', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    "Here's what you've logged today:\n🌅 Breakfast: Morning Oats — 430 kcal\n☀️ Lunch: Chicken Rice Bowl — 620 kcal\n🍎 Snack: Greek Yogurt — 350 kcal\nTotal: 1400 kcal"
  );
  await sendMessage(page, 'what did I eat today?');
  await waitForAiText(page, 'Breakfast');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toContain('Breakfast');
  expect(last).not.toContain('"action"');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 3 — Meal Templates
// ─────────────────────────────────────────────────────────────────────────────

test('F-3.1-T · Load template → show macros → confirm → logMeal (template unchanged)', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [{ templateName: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: '80g oats, 200ml milk, banana' }] };
    window.__mockLogMeal  = { ok: true, id: 'tpl_001' };
  });
  await setMockChat(page,
    'Found your breakfast template: 80g oats, 200ml milk, banana — 420 kcal | P:18g F:12g C:58g. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"breakfast","calories":420,"protein":18,"fat":12,"carbs":58,"notes":"from template: breakfast"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'add my breakfast');
  await waitForAiText(page, 'template');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const logCall = await getLastApiCall(page, 'logMeal');
  expect(logCall).not.toBeNull();
  const tplCall = await wasApiCalled(page, 'updateTemplate');
  expect(tplCall).toBe(false);
});

test('F-3.2-T · After logging from template → notes contains "from template"', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [{ templateName: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: '80g oats, 200ml milk' }] };
    window.__mockLogMeal  = { ok: true, id: 'tpl_002' };
  });
  await setMockChat(page,
    'Your breakfast template: 420 kcal. Shall I log it?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"breakfast","calories":420,"protein":18,"fat":12,"carbs":58,"notes":"from template: breakfast"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'add my breakfast');
  await waitForAiText(page, 'Shall I log it?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call.body.notes).toContain('from template: breakfast');
  expect(await wasApiCalled(page, 'updateTemplate')).toBe(false);
});

test('F-3.3-T · Explicit template update → updateTemplate called', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockUpdateTemplate = { ok: true };
  });
  await setMockChat(page,
    'I\'ll update your breakfast template to use 2 eggs instead of 3. Confirm?\n' +
    '{"action":"updateTemplate","payload":{"templateName":"breakfast","ingredients":"2 eggs, 50g bread","calories":300,"protein":18,"fat":12,"carbs":30}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'update my breakfast template: 2 eggs instead of 3');
  await waitForAiText(page, 'Confirm?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'template saved');

  const call = await getLastApiCall(page, 'updateTemplate');
  expect(call).not.toBeNull();
  expect(call.body.templateName).toBe('breakfast');
  expect(call.body.ingredients).toContain('2 eggs');
});

test('F-3.4-T · Partial override → notes contains "modified from template", template unchanged', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [{ templateName: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: '3 eggs, 50g bread, apple' }] };
    window.__mockLogMeal  = { ok: true, id: 'mod_001' };
  });
  await setMockChat(page,
    'Breakfast without bread: ~320 kcal | P:18g F:10g C:28g. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"Breakfast (no bread)","calories":320,"protein":18,"fat":10,"carbs":28,"notes":"modified from template: breakfast (without bread)"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'log breakfast without bread');
  await waitForAiText(page, 'without bread');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call.body.notes).toContain('modified from template: breakfast (without bread)');
  expect(await wasApiCalled(page, 'updateTemplate')).toBe(false);
});

test('F-3.5-T · Create template from scratch → updateTemplate called', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockUpdateTemplate = { ok: true }; });
  await setMockChat(page,
    'Post-gym snack: 1 banana, 30g whey, 200ml milk — 340 kcal | P:28g F:5g C:48g. Save this template?\n' +
    '{"action":"updateTemplate","payload":{"templateName":"post-gym snack","ingredients":"1 banana, 30g whey protein, 200ml milk","calories":340,"protein":28,"fat":5,"carbs":48}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'save this as my post-gym snack: 1 banana, 30g whey protein, 200ml milk');
  await waitForAiText(page, 'Save this template?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'template saved');

  const call = await getLastApiCall(page, 'updateTemplate');
  expect(call).not.toBeNull();
  expect(call.body.templateName).toBe('post-gym snack');
});

test("F-3.6-T · Create template from logged meal → updateTemplate with meal's exact values", async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockUpdateTemplate = { ok: true }; });
  await setMockChat(page,
    "I'll save today's lunch as \"my_lunch\" template with 620 kcal. Confirm?\n" +
    '{"action":"updateTemplate","payload":{"templateName":"my_lunch","ingredients":"150g chicken, rice","calories":620,"protein":45,"fat":12,"carbs":80}}'
  );
  await clearApiLog(page);

  await sendMessage(page, "save today's lunch as a template called 'my_lunch'");
  await waitForAiText(page, "my_lunch");
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'template saved');

  const call = await getLastApiCall(page, 'updateTemplate');
  expect(call).not.toBeNull();
  expect(call.body.templateName).toBe('my_lunch');
  expect(call.body.calories).toBe(620);
});

test('F-3.7-T C · Template search with no matches → correct message, no raw JSON', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [] };
  });
  await setMockChat(page, 'No saved templates found for that search');
  await clearApiLog(page);

  await sendMessage(page, 'what saved meals have octopus?');
  await waitForAiText(page, 'No saved templates found');

  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toContain('No saved templates found for that search');
  expect(last).not.toContain('"action"');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 4 — Daily Stats
// ─────────────────────────────────────────────────────────────────────────────

test('F-4.1-T · Stats card shows consumed / target calories', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  const card = await page.locator('.stats-card').first().innerHTML();
  expect(card).toContain('1400');
  expect(card).toContain('2200');
});

test('F-4.2-T · Stats card shows protein, fat, carbs consumed/target', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await sendMessage(page, "today's summary");
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  const card = await page.locator('.stats-card').first().innerHTML();
  expect(card).toMatch(/Protein/i);
  expect(card).toMatch(/Fat/i);
  expect(card).toMatch(/Carb/i);
  expect(card).toContain('150');  // target protein
  expect(card).toContain('70');   // target fat
});

test('F-4.3-T · Stats card shows all 4 meal types even when 0 kcal', async ({ page }) => {
  await loginAs(page);
  // Only breakfast and lunch logged (no dinner, no snack)
  await setMockStats(page, {
    ...MOCK_STATS,
    meals: [
      { id: '1', mealType: 'breakfast', name: 'Oats', calories: 430, protein: 15, fat: 8, carbs: 75 },
      { id: '2', mealType: 'lunch', name: 'Salad', calories: 320, protein: 12, fat: 10, carbs: 40 },
    ],
    consumed: 750,
  });
  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  const card = await page.locator('.stats-card').first().innerHTML();
  expect(card).toContain('Breakfast');
  expect(card).toContain('Lunch');
  expect(card).toContain('Dinner');
  expect(card).toContain('Snack');
});

test('F-4.4-T · Status indicators: ⚠️ Slightly low, ✅ On track, 🔴 Over target', async ({ page }) => {
  await loginAs(page);
  // 64% calories (⚠️), protein at 95% (✅), fat over 100% (🔴)
  await setMockStats(page, {
    consumed: 1400,
    targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
    meals: [
      { mealType: 'lunch', calories: 1400, protein: 143, fat: 80, carbs: 150 }
    ]
  });
  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  const card = await page.locator('.stats-card').first().textContent();
  expect(card).toContain('⚠️ Slightly low');  // calories at 64%
  expect(card).toContain('✅ On track');       // protein at 95%
  expect(card).toContain('🔴 Over target');    // fat over 100%
});

test('F-4.5-T · After logMeal → confirmation includes kcal today + remaining', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 500, targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 }, meals: []
    };
    window.__mockLogMeal = { ok: true, id: 'af_001' };
  });
  await setMockChat(page,
    'Ready to log 500 kcal breakfast. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"Oats","calories":500,"protein":15,"fat":8,"carbs":75}}'
  );
  await sendMessage(page, 'add my breakfast: oats');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'logged');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const confirmMsg = bubbles.find(b => b.includes('logged') && b.includes('remaining'));
  expect(confirmMsg).toBeTruthy();
  expect(confirmMsg).toMatch(/\d+ kcal/);
  expect(confirmMsg).toContain('remaining');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 5 — Targets
// ─────────────────────────────────────────────────────────────────────────────

test('F-5.1-T · Set daily targets → setTargets called, Claude confirms', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockSetTargets = { ok: true }; });
  await setMockChat(page,
    'I\'ll set your daily targets to 2000 kcal, 140g protein, 65g fat, 230g carbs. Confirm?\n' +
    '{"action":"setTargets","payload":{"calories":2000,"protein":140,"fat":65,"carbs":230}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'set my daily target: 2000 calories, 140g protein, 65g fat, 230g carbs');
  await waitForAiText(page, 'Confirm?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Targets updated');

  const call = await getLastApiCall(page, 'setTargets');
  expect(call).not.toBeNull();
  expect(call.body.calories).toBe(2000);
  expect(call.body.protein).toBe(140);
  expect(call.body.fat).toBe(65);
  expect(call.body.carbs).toBe(230);
});

test('F-5.2-T · Set per-meal targets → setTargets called with breakfastCal/lunchCal', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockSetTargets = { ok: true }; });
  await setMockChat(page,
    "I'll set breakfast to 450 kcal and lunch to 700 kcal. Confirm?\n" +
    '{"action":"setTargets","payload":{"breakfastCal":450,"lunchCal":700}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'set breakfast target to 450 kcal and lunch to 700 kcal');
  await waitForAiText(page, 'Confirm?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Targets updated');

  const call = await getLastApiCall(page, 'setTargets');
  expect(call.body.breakfastCal).toBe(450);
  expect(call.body.lunchCal).toBe(700);
});

test('F-5.3-T · Date-based target activation: April row vs January row', async ({ page }) => {
  await loginAs(page);
  // April targets
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 1400,
      targets: { calories: 1800, protein: 130, fat: 60, carbs: 220 },
      meals: []
    };
  });
  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  let card = await page.locator('.stats-card').first().textContent();
  expect(card).toContain('1800');

  // January targets
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 1200,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: []
    };
  });
  // Clear chat so we can test again
  await page.evaluate(() => { window.chatMsgs = []; document.querySelectorAll('.msg-row').forEach(e=>e.remove()); });
  await sendMessage(page, 'show my stats');
  await page.waitForFunction(() => document.querySelectorAll('.stats-card').length >= 1, { timeout: 5000 });
  const cards = await page.locator('.stats-card').all();
  const last = cards[cards.length - 1];
  const lastText = await last.textContent();
  expect(lastText).toContain('2200');
});

test('F-5.4-T · "Show my current targets" → targets card, no raw JSON', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await sendMessage(page, 'show my current targets');
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  const card = await page.locator('.stats-card').first();
  await expect(card).toContainText('Targets');
  const html = await card.innerHTML();
  expect(html).not.toContain('"action"');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 6 — Photo Parsing
// ─────────────────────────────────────────────────────────────────────────────

test('F-6.1-T · Photo → estimate shown → confirm → logMeal with notes="logged from photo"', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'photo_001' }; });
  await setMockChat(page,
    'I can see a grilled chicken breast with roasted vegetables. Estimated: 420 kcal | P:38g F:14g C:22g. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Grilled Chicken with Veg","calories":420,"protein":38,"fat":14,"carbs":22,"notes":"logged from photo"}}'
  );
  // Simulate photo attached
  await page.evaluate(() => {
    window.__setPendingPhoto('dGVzdA==', 'image/jpeg');
  });
  await clearApiLog(page);

  await sendMessage(page, 'what is this meal?');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.notes).toBe('logged from photo');
});

test('F-6.2-T · Product photo → nutritional info shown, serving size question asked', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'This looks like a Greek yogurt tub. Per 150g serving: 130 kcal | P:12g F:5g C:10g. Is this one serving (150g) or a different amount?'
  );
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg'); });

  await sendMessage(page, 'log this product');
  await waitForAiText(page, 'serving');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toMatch(/kcal/i);
  expect(last).toContain('?');
  expect(last).not.toContain('"action"');
});

test('F-6.3-T · Low-confidence photo → uncertainty flagged + editable card shown', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    "I'm not fully sure about the portions — this could be a pasta dish. Estimated: 500 kcal | P:15g F:12g C:80g.\n" +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Pasta dish","calories":500,"protein":15,"fat":12,"carbs":80}}'
  );
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg'); });

  await sendMessage(page, 'what is this?');
  await waitForAiText(page, "not fully sure");

  // Photo edit card should appear
  await page.waitForSelector('#photo-edit-card', { timeout: 5000 });
  await expect(page.locator('#pe-calories')).toBeVisible();
  await expect(page.locator('#pe-protein')).toBeVisible();
  await expect(page.locator('#pe-fat')).toBeVisible();
  await expect(page.locator('#pe-carbs')).toBeVisible();
});

test('F-6.4-T · Photo confirmation → notes="logged from photo", mealType set', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'photo_004' }; });
  await setMockChat(page,
    'Chicken salad estimated 380 kcal. Shall I log it as lunch?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken Salad","calories":380,"protein":32,"fat":15,"carbs":18}}'
  );
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg'); });
  await clearApiLog(page);

  await sendMessage(page, 'log this for lunch');
  await waitForAiText(page, 'Shall I log it');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call.body.notes).toBe('logged from photo');
  expect(call.body.mealType).toBe('lunch');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 7 — Meal Suggestions
// ─────────────────────────────────────────────────────────────────────────────

test('F-7.1-T · Suggest by ingredients → 2-3 meals with kcal', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Here are 3 meal ideas with chicken and eggs:\n' +
    '1. Chicken omelette — 380 kcal\n' +
    '2. Egg-fried chicken rice — 520 kcal\n' +
    '3. Chicken frittata — 420 kcal'
  );
  await sendMessage(page, 'suggest a meal with chicken and eggs');
  await waitForAiText(page, 'kcal');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  expect(last).toMatch(/\d+\s*kcal/);
  // At least 2 suggestions (numbered items)
  const matches = last.match(/\d\./g);
  expect(matches?.length).toBeGreaterThanOrEqual(2);
  expect(last).not.toContain('"action"');
});

test('F-7.2-T · Suggest by calorie budget → all ≤ 500 kcal', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Here are dinner ideas under 500 kcal:\n' +
    '1. Grilled fish with salad — 380 kcal\n' +
    '2. Turkey stir-fry — 420 kcal\n' +
    '3. Vegetable soup with bread — 350 kcal'
  );
  await sendMessage(page, 'suggest something under 500 kcal for dinner');
  await waitForAiText(page, 'kcal');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  const cals = [...last.matchAll(/(\d+)\s*kcal/g)].map(m => parseInt(m[1]));
  const mealCals = cals.filter(c => c > 50); // filter out small inline values
  expect(mealCals.length).toBeGreaterThanOrEqual(2);
  mealCals.forEach(c => expect(c).toBeLessThanOrEqual(500));
});

test('F-7.3-T · Suggest by macro profile → protein > 30g, fat < 10g stated', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'High protein, low fat meal ideas:\n' +
    '1. Grilled chicken breast — 165 kcal | P:31g F:3.5g\n' +
    '2. Tuna with cottage cheese — 210 kcal | P:38g F:5g\n' +
    '3. Turkey breast with rice — 330 kcal | P:35g F:4g'
  );
  await sendMessage(page, 'I need a high protein low fat meal');
  await waitForAiText(page, 'protein');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const last = bubbles[bubbles.length - 1];
  // Protein values should be mentioned
  const proteins = [...last.matchAll(/P:(\d+)g/g)].map(m => parseInt(m[1]));
  proteins.forEach(p => expect(p).toBeGreaterThan(30));
  const fats = [...last.matchAll(/F:([\d.]+)g/g)].map(m => parseFloat(m[1]));
  fats.forEach(f => expect(f).toBeLessThan(10));
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 8 — Edit & Delete
// ─────────────────────────────────────────────────────────────────────────────

test('F-8.1-T A · Delete meal by type → confirm → "Meal deleted." + stats refresh', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => {
    window.__mockDeleteMeal = { ok: true };
    window.__mockStats = {
      consumed: 0,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: []
    };
  });
  await setMockChat(page,
    'Will delete: Morning Oats, 430 kcal. Confirm?\n' +
    '{"action":"deleteMeal","payload":{"mealType":"breakfast","id":"1"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'delete my breakfast');
  await waitForAiText(page, 'Will delete');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal deleted');

  const call = await getLastApiCall(page, 'deleteMeal');
  expect(call).not.toBeNull();
  // Stats card should refresh
  await page.waitForSelector('.stats-card', { timeout: 5000 });
});

test('F-8.1-T B · Delete non-existent dinner → "No dinner logged today to delete"', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, { ...MOCK_STATS, meals: [] });
  await setMockChat(page, 'No dinner logged today to delete');
  await clearApiLog(page);

  await sendMessage(page, 'delete my dinner');
  await waitForAiText(page, 'No dinner logged today to delete');

  await expect(page.locator('#error-banner')).not.toHaveClass(/show/);
  const called = await wasApiCalled(page, 'deleteMeal');
  expect(called).toBe(false);
});

test('F-8.2-T · Edit meal → recalculate → confirm → updateMeal called + stats refresh', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => {
    window.__mockUpdateMeal = { ok: true };
    window.__mockStats = {
      consumed: 720,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: [{ id: '2', mealType: 'lunch', name: 'Chicken Rice Bowl', calories: 720, protein: 55, fat: 14, carbs: 80 }]
    };
  });
  await setMockChat(page,
    'Updated lunch with 200g chicken: 720 kcal | P:55g F:14g C:80g. Confirm change?\n' +
    '{"action":"updateMeal","payload":{"id":"2","name":"Chicken Rice Bowl","calories":720,"protein":55,"fat":14,"carbs":80,"ingredients":"200g chicken, rice"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'change chicken to 200g in my lunch');
  await waitForAiText(page, '720 kcal');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Meal updated');

  const call = await getLastApiCall(page, 'updateMeal');
  expect(call).not.toBeNull();
  expect(call.body.calories).toBe(720);
  await page.waitForSelector('.stats-card', { timeout: 5000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 9 — History & Export
// ─────────────────────────────────────────────────────────────────────────────

test('F-9.1-T · Clear chat → confirmation dialog → confirm → chat empty, meals unaffected', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  // Seed some messages
  await page.evaluate(() => {
    const msgs = [
      { role: 'user', content: 'msg1', time: '10:00' },
      { role: 'ai',   content: 'reply1', time: '10:00' },
    ];
    localStorage.setItem('ct_chat_history', JSON.stringify(msgs));
  });
  await page.reload();
  await page.waitForSelector('#chat-screen:not(.hidden)');

  await page.locator('[onclick="clearChat()"]').click();
  await expect(page.locator('#confirm-overlay')).toHaveClass(/show/, { timeout: 3000 });

  // Confirm clear
  await page.locator('#confirm-ok-btn').click();
  await expect(page.locator('#confirm-overlay')).not.toHaveClass(/show/);
  await expect(page.locator('#chat-empty')).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem('ct_chat_history'));
  expect(stored).toBeNull();
});

test('F-9.2-T · Chat history persists across reload', async ({ page }) => {
  await loginAs(page);
  // Seed 5 messages
  await page.evaluate(() => {
    const msgs = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'ai',
      content: `Message ${i + 1}`,
      time: '10:00'
    }));
    localStorage.setItem('ct_chat_history', JSON.stringify(msgs));
  });
  await page.reload();
  await page.waitForSelector('#chat-screen:not(.hidden)');

  const bubbles = await page.locator('.bubble').count();
  expect(bubbles).toBeGreaterThanOrEqual(5);

  // Send a new message
  await setMockStats(page);
  await setMockChat(page, 'Sure, how can I help?');
  await sendMessage(page, 'hello again');
  await waitForAiText(page, 'Sure, how can I help?');
});

test('F-9.3-T · Export → exportData API called, download triggered', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockExportData = {
      csv: 'Date,MealType,Name,Ingredients,Calories,Protein,Fat,Carbs,Fiber,Notes\n2026-05-07,lunch,Chicken Rice,150g chicken rice,620,45,12,80,0,'
    };
  });
  await clearApiLog(page);

  // Export button is now in settings screen — open settings first
  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });

  await page.locator('[onclick="exportMealLog()"]').click();
  await page.waitForTimeout(1500);

  // Key: exportData API was called
  const called = await wasApiCalled(page, 'exportData');
  expect(called).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

test('ERR-1-T · Chat API down → error banner + message preserved', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => { window.__mockChatFail = true; });

  const input = page.locator('#msg-input');
  await input.fill('what should I eat?');
  await page.locator('#btn-send').click();

  await expect(page.locator('#error-banner')).toHaveClass(/show/, { timeout: 5000 });
  const bannerText = await page.locator('#error-banner-text').textContent();
  expect(bannerText).toContain('AI is unreachable');
  await expect(page.locator('#error-banner-retry')).toBeVisible();
  // Message is preserved
  const inputVal = await input.inputValue();
  expect(inputVal).toBe('what should I eat?');
});

test('ERR-2-T · logMeal save failure → retry banner shown', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready to log 500 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"Oats","calories":500,"protein":15,"fat":8,"carbs":75}}'
  );
  await page.evaluate(() => { window.__mockLogMealFail = true; });

  await sendMessage(page, 'add my breakfast');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');

  await expect(page.locator('#error-banner')).toHaveClass(/show/, { timeout: 5000 });
  const txt = await page.locator('#error-banner-text').textContent();
  expect(txt).toContain("couldn't be saved");
});

test('ERR-4-T · Config error on validateUser → "App configuration error" shown', async ({ page }) => {
  await page.route('**/macros/s/**', (route, req) => {
    if (req.url().includes('validateUser')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'config_error' })
      });
    }
    route.continue();
  });
  await page.goto('/');
  await page.evaluate(() => window.__testLogin('test@gmail.com', 'Test'));
  await expect(page.locator('#login-alert')).toHaveClass(/show/, { timeout: 5000 });
  const msg = await page.locator('#alert-msg').textContent();
  expect(msg).toContain('App configuration error');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block UI — UI enhancements (fix branch)
// ─────────────────────────────────────────────────────────────────────────────

test('UI-1-T · Empty state shows 3 suggestion chips; clicking one sends the message', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page, 'Sure, logging scrambled eggs for breakfast!');

  await expect(page.locator('#chat-empty')).toBeVisible();
  const chips = await page.locator('.chip-btn').all();
  expect(chips.length).toBe(3);

  // Click the first chip → should fill input and send
  await chips[0].click();
  // Chat-empty should disappear after send
  await page.waitForFunction(() => document.querySelector('#chat-empty').style.display === 'none', { timeout: 5000 });
  // A user bubble should exist
  const userBubbles = await page.locator('.bubble.user').count();
  expect(userBubbles).toBeGreaterThanOrEqual(1);
});

test('UI-2-T · Quick-action bar: ☰ sends "Show my templates", 📊 sends today\'s stats', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [{ templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats, milk' }] };
  });

  // Click Templates quick-action → intercepted, shows template card
  await page.locator('.qa-btn').filter({ hasText: 'Templates' }).click();
  await page.waitForSelector('.templates-list', { timeout: 5000 });
  await expect(page.locator('.templates-list')).toBeVisible();

  // Click Stats quick-action → intercepted, shows stats card
  await page.locator('.qa-btn').filter({ hasText: "Stats" }).click();
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  await expect(page.locator('.stats-card').last()).toBeVisible();
});

test('UI-3-T · Settings: open → targets pre-fill → save → ✓ Saved shown, setTargets called', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 1400,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250, breakfastCal: 500, lunchCal: 700, dinnerCal: 700 },
      meals: []
    };
    window.__mockSetTargets = { success: true };
  });

  // Open settings
  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });

  // Targets should be pre-filled from getStats
  await page.waitForFunction(() => document.getElementById('st-calories').value !== '', { timeout: 3000 });
  expect(await page.locator('#st-calories').inputValue()).toBe('2200');
  expect(await page.locator('#st-protein').inputValue()).toBe('150');

  // Change a value and save
  await page.locator('#st-calories').fill('2400');
  await clearApiLog(page);
  await page.locator('#settings-save-btn').click();

  // Button should show ✓ Saved!
  await page.waitForFunction(() => document.getElementById('settings-save-btn').textContent.includes('Saved'), { timeout: 5000 });

  // setTargets was called with updated value
  const call = await getLastApiCall(page, 'setTargets');
  expect(call).not.toBeNull();
  expect(call.body.calories).toBe(2400);
  // All fields should be sent (protein should be 150, not 0)
  expect(call.body.protein).toBe(150);
});

test('UI-3-T B · Settings: error shown inline (not in chat) when save fails', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = { consumed: 0, targets: {}, meals: [] };
    window.__mockSetTargets = { success: false, error: 'Sheet error' };
  });

  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });

  await page.locator('#settings-save-btn').click();

  // Error should appear in settings screen, not chat screen
  await page.waitForFunction(() => document.getElementById('settings-error').style.display !== 'none', { timeout: 5000 });
  const errText = await page.locator('#settings-error').textContent();
  expect(errText).toContain('Could not save targets');

  // Chat screen error banner should NOT be shown
  await expect(page.locator('#error-banner')).not.toHaveClass(/show/);
});

test('UI-4-T · Stop button appears while AI is thinking; clicking cancels and re-enables input', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);

  // Intercept the chat API to simulate slow response
  let resolveChat;
  const chatPromise = new Promise(resolve => { resolveChat = resolve; });
  await page.route(API_URL_PATTERN, async (route, req) => {
    const body = JSON.parse(req.postData() || '{}');
    if (body.action === 'chat') {
      await chatPromise;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Done!' }) });
    }
    if (body.action === 'getStats') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_STATS) });
    }
    route.continue();
  });

  await page.fill('#msg-input', 'what should I eat?');
  await page.locator('#btn-send').click();

  // Stop button should appear
  await expect(page.locator('#btn-stop')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#btn-send')).toBeHidden();

  // Click stop
  await page.locator('#btn-stop').click();

  // Input should be re-enabled, send button restored
  await expect(page.locator('#btn-stop')).toBeHidden({ timeout: 3000 });
  await expect(page.locator('#btn-send')).toBeVisible();
  await expect(page.locator('#msg-input')).not.toBeDisabled();

  resolveChat(); // resolve to avoid hanging
});

// ─────────────────────────────────────────────────────────────────────────────
// Block TPLR — Template rendering
// ─────────────────────────────────────────────────────────────────────────────

test('TPLR-1-T · "Show my templates" → template card rendered (not raw HTML divs)', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockTemplate = {
      found: true, count: 2,
      templates: [
        { templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats, milk, banana' },
        { templateName: 'post-gym snack', mealType: 'snack', calories: 340, protein: 28, fat: 5, carbs: 48, ingredients: 'banana, whey, milk' },
      ]
    };
  });

  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.templates-list', { timeout: 5000 });

  // Template card elements should be rendered as DOM, not raw text
  await expect(page.locator('.templates-list')).toBeVisible();
  await expect(page.locator('.template-card').first()).toBeVisible();

  // Should NOT show raw HTML as text
  const bubbleHtml = await page.locator('.bubble.ai').last().innerHTML();
  expect(bubbleHtml).not.toMatch(/&lt;div/);
  expect(bubbleHtml).not.toContain('templates-grid');

  // Should contain template name and calories
  await expect(page.locator('.template-card').first()).toContainText('breakfast');
  await expect(page.locator('.template-card').first()).toContainText('420');
});

test('TPLR-2-T · Template card shows name, type emoji, ingredients, and all 4 macros', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockTemplate = {
      found: true, count: 1,
      templates: [{ templateName: 'paradise', mealType: 'breakfast', calories: 389, protein: 16.9, fat: 6.9, carbs: 66.3, ingredients: 'oatmeal 100g' }]
    };
  });

  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.template-card', { timeout: 5000 });

  const card = await page.locator('.template-card').first();
  await expect(card).toContainText('paradise');
  await expect(card).toContainText('🌅');          // breakfast emoji
  await expect(card).toContainText('oatmeal 100g');
  await expect(card).toContainText('389');          // calories
  await expect(card).toContainText('16.9');         // protein
});

test('TPLR-3-T · Empty template list → "No templates saved yet" message', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => { window.__mockTemplate = { found: false, count: 0, templates: [] }; });

  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.templates-list', { timeout: 5000 });
  await expect(page.locator('.templates-list')).toContainText('No templates saved yet');
});

// ─────────────────────────────────────────────────────────────────────────────
// Block NORM — API response normalization (real API vs mock)
// ─────────────────────────────────────────────────────────────────────────────

test('NORM-1-T · Real API stats format (totals.calories) renders correctly', async ({ page }) => {
  await loginAs(page);
  // Simulate real Apps Script getStats response format
  await page.evaluate(() => {
    window.__mockStats = {
      date: '2026-05-08',
      totals: { calories: 1400, protein: 85, fat: 40, carbs: 160 },
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: [
        { MealType: 'breakfast', Name: 'Oats', Calories: 430, Protein: 15, Fat: 8, Carbs: 75 },
        { MealType: 'lunch', Name: 'Chicken Rice', Calories: 620, Protein: 45, Fat: 12, Carbs: 80 },
        { MealType: 'snack', Name: 'Yogurt', Calories: 350, Protein: 25, Fat: 20, Carbs: 5 },
      ]
    };
  });

  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });

  const card = await page.locator('.stats-card').first().textContent();
  // Should show 1400 (from totals.calories), not 0
  expect(card).toContain('1400');
  expect(card).toContain('2200');
  // Meal types should be normalized (TitleCase → camelCase)
  expect(card).toContain('Breakfast');
  expect(card).toContain('Lunch');
});

test('NORM-2-T · Real API deleteMeal response (success:true, no ok) → shows "Meal deleted", not "not found"', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  // Real API returns {success: true, deleted: {...}} — no 'ok' field
  await page.evaluate(() => {
    window.__mockDeleteMeal = { success: true, deleted: { id: '1', name: 'Morning Oats', mealType: 'breakfast', calories: 430 } };
    window.__mockStats = { consumed: 970, targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 }, meals: [] };
  });
  await setMockChat(page,
    'Will delete: Morning Oats, 430 kcal. Confirm?\n' +
    '{"action":"deleteMeal","payload":{"mealType":"breakfast","id":"1"}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'delete my breakfast');
  await waitForAiText(page, 'Will delete');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');

  // Should show success message, NOT "No breakfast logged today to delete"
  await waitForAiText(page, 'Meal deleted');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const confirmMsg = bubbles.find(b => b.includes('Meal deleted') || b.includes('logged') && b.includes('remaining'));
  expect(confirmMsg).toBeTruthy();
  // Should NOT say "No breakfast logged today to delete"
  const wrongMsg = bubbles.find(b => b.includes('No breakfast logged today to delete'));
  expect(wrongMsg).toBeUndefined();
});

test('NORM-3-T · Template keys normalized from TitleCase → system prompt has correct template data', async ({ page }) => {
  await loginAs(page);
  // Simulate real API template response with TitleCase keys
  await page.evaluate(() => {
    window.__mockTemplate = {
      found: true, count: 1,
      templates: [{ TemplateName: 'breakfast', MealType: 'breakfast', Calories: 420, Protein: 18, Fat: 12, Carbs: 58, Ingredients: 'oats, milk, banana' }]
    };
  });

  // Check via __normalizeTemplates hook
  const normalized = await page.evaluate(() =>
    window.__normalizeTemplates([{ TemplateName: 'breakfast', MealType: 'breakfast', Calories: 420, Protein: 18, Fat: 12, Carbs: 58, Ingredients: 'oats, milk' }])
  );
  expect(normalized[0].templateName).toBe('breakfast');
  expect(normalized[0].calories).toBe(420);
  expect(normalized[0].mealType).toBe('breakfast');
});

test('NORM-4-T · normalizeStats maps totals.calories → consumed without overwriting existing consumed', async ({ page }) => {
  await loginAs(page);

  // Real API format: should map totals.calories → consumed
  const real = await page.evaluate(() =>
    window.__normalizeStats({ totals: { calories: 1500 }, targets: { calories: 2000 }, meals: [] })
  );
  expect(real.consumed).toBe(1500);

  // Mock format: already has consumed — should not override
  const mock = await page.evaluate(() =>
    window.__normalizeStats({ consumed: 1400, totals: { calories: 9999 }, targets: { calories: 2200 }, meals: [] })
  );
  expect(mock.consumed).toBe(1400);
});

// ─────────────────────────────────────────────────────────────────────────────
// Block CONFIRM — Confirmation message after logMeal/deleteMeal/updateMeal
// ─────────────────────────────────────────────────────────────────────────────

test('CONFIRM-1-T · After logMeal succeeds → "Done — Meal logged" confirmation appears immediately', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => { window.__mockLogMeal = { success: true, id: 42, date: '2026-05-08' }; });
  await setMockChat(page,
    'Ready to log 500 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"Oats","calories":500,"protein":15,"fat":8,"carbs":75}}'
  );

  await sendMessage(page, 'add my breakfast');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');

  // Confirmation message should appear with "Done" and "Meal logged"
  await waitForAiText(page, 'Done');
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const confirmMsg = bubbles.find(b => b.includes('Done') && b.includes('Meal logged'));
  expect(confirmMsg).toBeTruthy();
  // Should include the ID
  expect(confirmMsg).toContain('ID: 42');
});

test('CONFIRM-2-T · Confirmation shown even if post-action getStats fails', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => { window.__mockLogMeal = { success: true, id: 99 }; });
  await setMockChat(page,
    'Logging 400 kcal salad. Confirm?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Salad","calories":400,"protein":20,"fat":10,"carbs":40}}'
  );

  await sendMessage(page, 'log my salad lunch');
  await waitForAiText(page, 'Confirm?');

  // Make post-action getStats fail (return error)
  await page.evaluate(() => {
    window.__mockChatResponse = null;
    // Override mock stats to return an error after logging
    let callCount = 0;
    const originalMock = window.__mockStats;
    Object.defineProperty(window, '__mockStats', {
      get() { callCount++; return callCount > 1 ? { error: 'stats failed' } : originalMock; },
      set(v) { /* allow re-setting */ },
      configurable: true
    });
  });

  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Done');

  // Confirmation message should still appear even though stats failed
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const confirmMsg = bubbles.find(b => b.includes('Done') && b.includes('Meal logged'));
  expect(confirmMsg).toBeTruthy();
});

test('CONFIRM-3-T · After logMeal → kcal totals shown when stats has data', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 500,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: [{ mealType: 'breakfast', name: 'Oats', calories: 500, protein: 15, fat: 8, carbs: 75 }]
    };
    window.__mockLogMeal = { success: true, id: 1 };
  });
  await setMockChat(page,
    'Ready: 500 kcal oats. Confirm?\n' +
    '{"action":"logMeal","payload":{"mealType":"breakfast","name":"Oats","calories":500,"protein":15,"fat":8,"carbs":75}}'
  );

  await sendMessage(page, 'log oats');
  await waitForAiText(page, 'Confirm?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Done');

  // Both confirmation AND kcal totals should appear as separate messages
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  const confirm = bubbles.find(b => b.includes('Done') && b.includes('Meal logged'));
  const totals  = bubbles.find(b => b.includes('logged 500 kcal') && b.includes('remaining'));
  expect(confirm).toBeTruthy();
  expect(totals).toBeTruthy();

  // Stats card should also be shown
  await page.waitForSelector('.stats-card', { timeout: 3000 });
});

test('CONFIRM-4-T · Real API logMeal response {success:true, id, date} → confirmation appears', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  // Simulate real API logMeal response (no `ok` field, only `success` + `id` + `date`)
  await page.evaluate(() => { window.__mockLogMeal = { success: true, id: 7, date: '2026-05-08' }; });
  await setMockChat(page,
    'Logging 600 kcal lunch. Confirm?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Pasta","calories":600,"protein":25,"fat":15,"carbs":80}}'
  );
  await clearApiLog(page);

  await sendMessage(page, 'log my pasta lunch');
  await waitForAiText(page, 'Confirm?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await sendMessage(page, 'yes');
  await waitForAiText(page, 'Done');

  // Verify logMeal was called
  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.calories).toBe(600);

  // Verify confirmation appeared
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  expect(bubbles.some(b => b.includes('Done') && b.includes('Meal logged'))).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Block STG — Settings real-API integration
// ─────────────────────────────────────────────────────────────────────────────

test('STG-1-T · Settings: targets pre-fill from real API getStats response', async ({ page }) => {
  await loginAs(page);
  // Real API stats response: targets nested with explicit fields
  await page.evaluate(() => {
    window.__mockStats = {
      date: '2026-05-08',
      totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
      targets: {
        calories: 2400, protein: 160, fat: 75, carbs: 280, fiber: 25,
        breakfastCal: 600, lunchCal: 800, dinnerCal: 700
      },
      meals: []
    };
  });

  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });
  // Wait for fields to populate
  await page.waitForFunction(() => document.getElementById('st-calories').value !== '', { timeout: 3000 });

  expect(await page.locator('#st-calories').inputValue()).toBe('2400');
  expect(await page.locator('#st-protein').inputValue()).toBe('160');
  expect(await page.locator('#st-fat').inputValue()).toBe('75');
  expect(await page.locator('#st-carbs').inputValue()).toBe('280');
  expect(await page.locator('#st-fiber').inputValue()).toBe('25');
  expect(await page.locator('#st-breakfast').inputValue()).toBe('600');
  expect(await page.locator('#st-lunch').inputValue()).toBe('800');
  expect(await page.locator('#st-dinner').inputValue()).toBe('700');
});

test('STG-2-T · Settings: real API setTargets {success:true, dateFrom} response → ✓ Saved', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = { totals: { calories: 0 }, targets: {}, meals: [] };
    window.__mockSetTargets = { success: true, updated: true, dateFrom: '2026-05-08' };
  });

  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });

  await page.locator('#st-calories').fill('2000');
  await page.locator('#st-protein').fill('140');
  await clearApiLog(page);
  await page.locator('#settings-save-btn').click();

  await page.waitForFunction(() => document.getElementById('settings-save-btn').textContent.includes('Saved'), { timeout: 5000 });

  // Verify all 8 fields sent (no field omitted as undefined)
  const call = await getLastApiCall(page, 'setTargets');
  expect(call).not.toBeNull();
  expect(call.body.calories).toBe(2000);
  expect(call.body.protein).toBe(140);
  expect(call.body).toHaveProperty('fat');
  expect(call.body).toHaveProperty('carbs');
  expect(call.body).toHaveProperty('fiber');
  expect(call.body).toHaveProperty('breakfastCal');
  expect(call.body).toHaveProperty('lunchCal');
  expect(call.body).toHaveProperty('dinnerCal');
});

test('STG-3-T · Stats: targets row from User_Targets shown in stats card via real API format', async ({ page }) => {
  await loginAs(page);
  // Simulate real API response: targets present (latest row matched), totals 0 (no meals yet today)
  await page.evaluate(() => {
    window.__mockStats = {
      date: '2026-05-08',
      totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: []
    };
  });

  await sendMessage(page, 'show my stats');
  await page.waitForSelector('.stats-card', { timeout: 5000 });

  const card = await page.locator('.stats-card').first().textContent();
  expect(card).toContain('2200');  // target calories from User_Targets
  expect(card).toContain('150');   // target protein
  // 0 / 2200 should be shown
  expect(card).toMatch(/0\s*\/\s*2200/);
});
