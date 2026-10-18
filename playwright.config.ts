import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync(localChromium) ? localChromium : undefined)
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'pt-MZ',
    timezoneId: 'Africa/Maputo',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : undefined }, testMatch: /candidato\.spec\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : undefined }, testIgnore: /candidato\.spec\.ts/ },
  ],
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
