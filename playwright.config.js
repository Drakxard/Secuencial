const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ }
  ]
});
