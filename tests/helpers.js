'use strict';

const API_PATTERN = '**/macros/s/**';

const MOCK_STATS = {
  ok: true,
  consumed: 1400,
  targets: { calories: 2200, protein: 150, fat: 70, carbs: 250, breakfastCal: 500, lunchCal: 700, dinnerCal: 700 },
  meals: [
    { id: '1', mealType: 'breakfast', name: 'Morning Oats',     calories: 430, protein: 15, fat: 8,  carbs: 75, ingredients: 'oats, milk, banana' },
    { id: '2', mealType: 'lunch',     name: 'Chicken Rice Bowl',calories: 620, protein: 45, fat: 12, carbs: 80, ingredients: '150g chicken, rice' },
    { id: '3', mealType: 'snack',     name: 'Greek Yogurt',     calories: 350, protein: 20, fat: 5,  carbs: 30, ingredients: 'greek yogurt' },
  ]
};

const MOCK_STATS_EMPTY = {
  ok: true,
  consumed: 0,
  targets: { calories: 2200, protein: 150, fat: 70, carbs: 250 },
  meals: []
};

/** Navigate to the app and set an authenticated session */
async function loginAs(page, email = 'owner@gmail.com', name = 'Owner') {
  await page.goto('/');
  await page.evaluate(([e, n, k]) => {
    localStorage.setItem(k, JSON.stringify({ email: e, name: n }));
  }, [email, name, 'ct_session']);
  await page.reload();
  await page.waitForSelector('#chat-screen:not(.hidden)', { timeout: 5000 });
}

/** Set a mock stats response via the test hook */
async function setMockStats(page, stats = MOCK_STATS) {
  await page.evaluate((s) => { window.__mockStats = s; }, stats);
}

/** Set a mock chat response via the test hook */
async function setMockChat(page, text) {
  await page.evaluate((t) => { window.__mockChatResponse = t; }, text);
}

/** Clear mock chat response */
async function clearMockChat(page) {
  await page.evaluate(() => { window.__mockChatResponse = null; });
}

/** Type a message and send it */
async function sendMessage(page, text) {
  const input = page.locator('#msg-input');
  await input.fill(text);
  await page.locator('#btn-send').click();
}

/** Wait for the last AI bubble text to contain a substring */
async function waitForAiText(page, substring, timeout = 10000) {
  await page.waitForFunction(
    (sub) => {
      const bubbles = [...document.querySelectorAll('.bubble.ai')];
      return bubbles.some(b => b.textContent.includes(sub) || b.innerHTML.includes(sub));
    },
    substring,
    { timeout }
  );
}

/** Get the text content of all AI bubbles */
async function getAllAiBubbleText(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.bubble.ai')].map(b => b.textContent)
  );
}

/** Clear the API call log */
async function clearApiLog(page) {
  await page.evaluate(() => { window.__apiCallLog = []; });
}

/** Get the last logged API call for a given action */
async function getLastApiCall(page, action) {
  return page.evaluate((a) => {
    const log = window.__apiCallLog || [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].action === a) return log[i];
    }
    return null;
  }, action);
}

/** Check API call log for whether an action was called */
async function wasApiCalled(page, action) {
  return page.evaluate((a) => {
    const log = window.__apiCallLog || [];
    return log.some(c => c.action === a);
  }, action);
}

module.exports = {
  MOCK_STATS,
  MOCK_STATS_EMPTY,
  loginAs,
  setMockStats,
  setMockChat,
  clearMockChat,
  sendMessage,
  waitForAiText,
  getAllAiBubbleText,
  clearApiLog,
  getLastApiCall,
  wasApiCalled,
};
