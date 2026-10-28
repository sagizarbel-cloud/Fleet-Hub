import { defineConfig, devices } from '@playwright/test';

// Runs against the dev servers (`pnpm dev`) and the seeded dev database (`pnpm db:seed`).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // One at a time: the tests share the seeded accounts, and a language switch is saved to the
  // account, so two files in parallel would see each other's language.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'test-results/.auth/admin.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'pnpm --dir ../.. dev',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
