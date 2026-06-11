import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // PWA/Capacitor-App: Spielmodi zusaetzlich im Mobil-Viewport smoken.
    // Admin-Specs bleiben Desktop-only (Admin-UI ist nicht mobiloptimiert).
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /spielmodi-smoke\.spec\.js/,
    },
  ],
  webServer: {
    // Wrapper: isolierte Temp-DB + Admin-Account + Seeds, dann Server-Start
    // (e2e/start-server.js) — E2E laeuft damit auf frischem Checkout und in CI.
    command: `node e2e/start-server.js`,
    url: `${BASE_URL}/admin`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: process.env.NODE_ENV || 'test',
      ADMIN_KEY: process.env.ADMIN_KEY || 'dev-only',
    },
  },
})
