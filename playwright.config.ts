import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'

// Load .env.local for global setup/teardown and tests
try {
  const content = readFileSync('.env.local', 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx < 1) continue
    const key = t.slice(0, idx).trim()
    let val = t.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* ignore */ }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,   // sequential — tests share DB state
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,             // single worker to avoid test data conflicts
  reporter: 'list',
  globalSetup:    './e2e/global.setup.ts',
  globalTeardown: './e2e/global.teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
