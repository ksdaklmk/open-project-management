import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      // Authenticated local runs should let Vite load the real JWT from
      // .env.local. The placeholder is sufficient only for the signed-out UI.
      ...(process.env.VITE_SUPABASE_ANON_KEY
        ? { VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY }
        : process.env.E2E_AUTHENTICATED === 'true'
          ? {}
          : { VITE_SUPABASE_ANON_KEY: 'browser-smoke-anon-key' }),
    },
  },
})
