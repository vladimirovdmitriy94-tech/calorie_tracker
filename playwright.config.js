// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3456',
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npx serve -p 3456 -s .',
    url: 'http://localhost:3456',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
