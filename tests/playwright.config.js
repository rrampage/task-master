// tests/playwright.config.js
import { defineConfig, devices } from '@playwright/test'
// const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './',
  fullyParallel: true, // Optional: run tests in files in parallel
  forbidOnly: !!process.env.CI, // Fail the build on CI if you accidentally left test.only in the source code
  retries: process.env.CI ? 2 : 0, // Retry on CI only
  workers: process.env.CI ? 1 : undefined, // Opt out of parallel tests on CI
  reporter: 'html', // Reporter to use. See https://playwright.dev/docs/test-reporters
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry', // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    headless: true, // Ensure headless is still here or managed by projects
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // You could also add WebKit (Safari)
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // Example for mobile viewports (optional)
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  // webServer part can remain commented out or be configured if desired
  // webServer: {
  //   command: 'npm run start-server', // This would now be relative to tests/package.json
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: !process.env.CI,
  //   cwd: './', // Set working directory for the webServer command to tests/
  // },
})
