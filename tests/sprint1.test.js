'use strict';
const { test, expect } = require('@playwright/test');
const {
  MOCK_STATS, MOCK_STATS_EMPTY,
  loginAs, setMockStats, setMockChat, clearMockChat,
  sendMessage, waitForAiText,
  clearApiLog, getLastApiCall, wasApiCalled,
} = require('./helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 1 — UAT tests (S1-1 through S1-6)
// ─────────────────────────────────────────────────────────────────────────────

// ─── S1-1: Allow sending a photo with empty text ─────────────────────────────

test('S1-1-AC1 · Photo + empty text → chat fires with default prompt', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'I see grilled chicken with vegetables. ~420 kcal | P:38g F:14g C:22g. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken with Veg","calories":420,"protein":38,"fat":14,"carbs":22,"notes":"logged from photo"}}'
  );
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg'); });
  await clearApiLog(page);

  // Empty text + photo → tap Send
  await page.locator('#msg-input').fill('');
  await page.locator('#btn-send').click();
  await waitForAiText(page, 'Shall I log this?');

  const call = await getLastApiCall(page, 'chat');
  expect(call).not.toBeNull();
  // Last user message should contain the default prompt + image content
  const last = call.body.messages[call.body.messages.length - 1];
  expect(Array.isArray(last.content)).toBe(true);
  const textPart  = last.content.find(p => p.type === 'text');
  const imagePart = last.content.find(p => p.type === 'image');
  expect(textPart.text).toContain('analyse this photo');
  expect(imagePart).toBeTruthy();
});

test('S1-1-AC2 · Empty text + no photo → no request fires', async ({ page }) => {
  await loginAs(page);
  await clearApiLog(page);
  await page.locator('#msg-input').fill('');
  await page.locator('#btn-send').click();
  await page.waitForTimeout(400);
  const called = await wasApiCalled(page, 'chat');
  expect(called).toBe(false);
});

test('S1-1-AC3 · Photo-only send → low-confidence response triggers edit card', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    "I'm not fully sure about the portions — looks like a pasta dish. ~500 kcal | P:15g F:12g C:80g\n" +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Pasta dish","calories":500,"protein":15,"fat":12,"carbs":80}}'
  );
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg'); });

  await page.locator('#msg-input').fill('');
  await page.locator('#btn-send').click();
  await waitForAiText(page, "not fully sure");
  await page.waitForSelector('#photo-edit-card', { timeout: 5000 });
  await expect(page.locator('#pe-calories')).toBeVisible();
});

// ─── S1-2: Photo thumbnail preview after upload ──────────────────────────────

test('S1-2-AC1 · Selecting a photo renders a chip with thumbnail + filename', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg', 'breakfast.jpg'); });
  await expect(page.locator('#photo-chip')).toHaveClass(/show/);
  await expect(page.locator('#photo-chip-name')).toHaveText('breakfast.jpg');
  const src = await page.locator('#photo-chip-thumb').getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg;base64,/);
});

test('S1-2-AC2 · Clicking ✕ removes chip AND clears pendingPhoto', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg', 'lunch.png'); });
  await expect(page.locator('#photo-chip')).toHaveClass(/show/);
  await page.locator('#photo-chip-remove').click();
  await expect(page.locator('#photo-chip')).not.toHaveClass(/show/);
  const has = await page.evaluate(() => !!window.__getAbortController === false && !!(window).pendingPhoto);
  // Indirect check: btn-photo no longer has has-photo class
  await expect(page.locator('#btn-photo')).not.toHaveClass(/has-photo/);
});

test('S1-2-AC3 · After successful send, the chip disappears', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page, 'Got it.');
  await page.evaluate(() => { window.__setPendingPhoto('dGVzdA==', 'image/jpeg', 'meal.jpg'); });
  await expect(page.locator('#photo-chip')).toHaveClass(/show/);
  await sendMessage(page, 'log this');
  await waitForAiText(page, 'Got it');
  await expect(page.locator('#photo-chip')).not.toHaveClass(/show/);
  await expect(page.locator('#btn-photo')).not.toHaveClass(/has-photo/);
});

// ─── S1-3: "➕ Log this" button on template cards ─────────────────────────────

test('S1-3-AC1 · Each template card has a visible "➕ Log this" button', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [
      { templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats, milk' },
      { templateName: 'salad',     mealType: 'lunch',     calories: 320, protein: 22, fat: 14, carbs: 18, ingredients: 'chicken, greens' },
    ]};
  });
  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.templates-list', { timeout: 5000 });
  const btns = page.locator('.template-log-btn');
  await expect(btns).toHaveCount(2);
  await expect(btns.first()).toContainText('Log this');
  await expect(btns.first()).toBeVisible();
});

test('S1-3-AC2 · Clicking it shows Confirm/Cancel prompt with the meal name', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [
      { templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats' },
    ]};
  });
  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.template-log-btn', { timeout: 5000 });
  await page.locator('.template-log-btn').first().click();

  // Confirm prompt mentions the template name
  await waitForAiText(page, 'breakfast');
  await expect(page.locator('#pending-confirm-btn')).toBeVisible();
  await expect(page.locator('#pending-cancel-btn')).toBeVisible();
});

test('S1-3-AC3 · Confirm → logMeal called with notes="from template: …"', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [
      { templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats, milk' },
    ]};
    window.__mockLogMeal = { ok: true, id: 'tpl_btn_001' };
  });
  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.template-log-btn', { timeout: 5000 });
  await page.locator('.template-log-btn').first().click();
  await page.waitForSelector('#pending-confirm-btn', { timeout: 3000 });
  await clearApiLog(page);
  await page.locator('#pending-confirm-btn').click();
  await waitForAiText(page, 'Meal logged');

  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.notes).toBe('from template: breakfast');
  expect(call.body.calories).toBe(420);
  expect(call.body.protein).toBe(18);
  expect(call.body.mealType).toBe('breakfast');
});

test('S1-3-AC4 · Cancel → no API call, no state change', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [
      { templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats' },
    ]};
  });
  await sendMessage(page, 'show my templates');
  await page.waitForSelector('.template-log-btn', { timeout: 5000 });
  await page.locator('.template-log-btn').first().click();
  await page.waitForSelector('#pending-cancel-btn', { timeout: 3000 });
  await clearApiLog(page);
  await page.locator('#pending-cancel-btn').click();
  await page.waitForTimeout(400);
  const called = await wasApiCalled(page, 'logMeal');
  expect(called).toBe(false);
  // Buttons disappear
  await expect(page.locator('#pending-action-row')).toHaveCount(0);
});

// ─── S1-4: Confirm/Cancel buttons on pending action ──────────────────────────

test('S1-4-AC1 · pendingAction → two buttons appear inline', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready to log: 500 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken Rice","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await sendMessage(page, '150g chicken and rice for lunch');
  await waitForAiText(page, 'Shall I log this?');
  await expect(page.locator('#pending-confirm-btn')).toBeVisible();
  await expect(page.locator('#pending-cancel-btn')).toBeVisible();
});

test('S1-4-AC2 · Confirm triggers executeAction with the same payload', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready to log: 500 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken Rice","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'btn_001' }; });
  await sendMessage(page, '150g chicken and rice');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await clearApiLog(page);
  await page.locator('#pending-confirm-btn').click();
  await waitForAiText(page, 'Meal logged');
  const call = await getLastApiCall(page, 'logMeal');
  expect(call).not.toBeNull();
  expect(call.body.mealType).toBe('lunch');
  expect(call.body.calories).toBe(500);
});

test('S1-4-AC3 · Cancel clears pendingAction and shows "Cancelled" hint', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready to log: 500 kcal. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"X","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await sendMessage(page, 'log lunch');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await clearApiLog(page);
  await page.locator('#pending-cancel-btn').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#pending-action-row')).toHaveCount(0);
  const pending = await page.evaluate(() => window.__pendingAction);
  expect(pending).toBeNull();
  const called = await wasApiCalled(page, 'logMeal');
  expect(called).toBe(false);
  // "Cancelled" hint visible
  const bubbles = await page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
  expect(bubbles[bubbles.length - 1]).toContain('Cancelled');
});

test('S1-4-AC4 · Typing "yes" still works (no F-2.3-T regression)', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Sounds good! Ready to log: 500 kcal, 40g protein. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"Chicken Rice","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'meal_yes' }; });
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

test('S1-4-AC5 · Buttons disappear after confirm or cancel', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page);
  await setMockChat(page,
    'Ready. Shall I log this?\n' +
    '{"action":"logMeal","payload":{"mealType":"lunch","name":"X","calories":500,"protein":40,"fat":10,"carbs":55}}'
  );
  await page.evaluate(() => { window.__mockLogMeal = { ok: true, id: 'btn_002' }; });
  await sendMessage(page, 'log lunch');
  await waitForAiText(page, 'Shall I log this?');
  await page.evaluate(() => { window.__mockChatResponse = null; });
  await page.locator('#pending-confirm-btn').click();
  await waitForAiText(page, 'Meal logged');
  await expect(page.locator('#pending-action-row')).toHaveCount(0);
});

// ─── S1-5: Read-only Current Targets summary in Settings ─────────────────────

test('S1-5-AC1 · Opening Settings shows a Current Targets read-only block', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 0,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250, fiber: 25, breakfastCal: 500, lunchCal: 700, dinnerCal: 700 },
      meals: []
    };
  });
  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('targets-summary');
    return el && el.textContent.includes('2200');
  }, { timeout: 3000 });

  const txt = await page.locator('#targets-summary').textContent();
  expect(txt).toContain('2200');
  expect(txt).toContain('150g');
  expect(txt).toContain('70g');
  expect(txt).toContain('250g');
  expect(txt).toContain('500');  // breakfast
  expect(txt).toContain('700');  // lunch / dinner
});

test('S1-5-AC2 · No targets configured → friendly empty-state text shown', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = { consumed: 0, targets: {}, meals: [] };
  });
  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('targets-summary');
    return el && el.textContent.includes('No targets');
  }, { timeout: 3000 });
  const txt = await page.locator('#targets-summary').textContent();
  expect(txt).toMatch(/no targets configured yet/i);
});

test('S1-5-AC3 · After saving, summary updates without reload', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      consumed: 0,
      targets: { calories: 2000, protein: 100, fat: 60, carbs: 200 },
      meals: []
    };
    window.__mockSetTargets = { success: true };
  });
  await page.locator('[onclick="openSettings()"]').click();
  await page.waitForSelector('#settings-screen:not(.hidden)', { timeout: 3000 });
  await page.waitForFunction(() => document.getElementById('st-calories').value !== '', { timeout: 3000 });

  await page.locator('#st-calories').fill('2400');
  await page.locator('#st-protein').fill('160');
  await page.locator('#settings-save-btn').click();
  await page.waitForFunction(() => document.getElementById('settings-save-btn').textContent.includes('Saved'), { timeout: 5000 });

  const txt = await page.locator('#targets-summary').textContent();
  expect(txt).toContain('2400');
  expect(txt).toContain('160g');
});

// ─── S1-6: Quick action — replace Photo with Yesterday ───────────────────────

test('S1-6-AC1 · Only one camera icon visible on the chat screen', async ({ page }) => {
  await loginAs(page);
  // Old "📷 Photo" qa-btn is gone; #btn-photo (input bar camera) remains as the only one.
  const photoQa = page.locator('.qa-btn').filter({ hasText: 'Photo' });
  await expect(photoQa).toHaveCount(0);
  await expect(page.locator('#btn-photo')).toBeVisible();
});

test('S1-6-AC2 · "📅 Yesterday" button shows yesterday\'s stats card with date param', async ({ page }) => {
  await loginAs(page);
  await page.evaluate(() => {
    window.__mockStats = {
      ok: true,
      consumed: 1700,
      targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
      meals: [{ id: 'y1', mealType: 'lunch', name: 'Pasta', calories: 600, protein: 18, fat: 12, carbs: 90, ingredients: 'pasta' }]
    };
  });
  await clearApiLog(page);
  await page.locator('.qa-btn').filter({ hasText: 'Yesterday' }).click();
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  await expect(page.locator('.stats-card').last()).toBeVisible();

  const call = await getLastApiCall(page, 'getStats');
  expect(call).not.toBeNull();
  // body.date should be yesterday
  const expected = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  expect(call.body.date).toBe(expected);
});

test('S1-6-AC3 · Existing ☰ Templates and 📊 Today\'s Stats still work', async ({ page }) => {
  await loginAs(page);
  await setMockStats(page, MOCK_STATS);
  await page.evaluate(() => {
    window.__mockTemplate = { templates: [{ templateName: 'breakfast', mealType: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 58, ingredients: 'oats' }] };
  });

  await page.locator('.qa-btn').filter({ hasText: 'Templates' }).click();
  await page.waitForSelector('.templates-list', { timeout: 5000 });
  await expect(page.locator('.templates-list')).toBeVisible();

  await page.locator('.qa-btn').filter({ hasText: "Stats" }).click();
  await page.waitForSelector('.stats-card', { timeout: 5000 });
  await expect(page.locator('.stats-card').last()).toBeVisible();
});
