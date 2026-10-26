import { test as setup } from '@playwright/test';
import { ADMIN, STORAGE_STATE, VIEWER, VIEWER_STATE } from './helpers';

// Signs in once per run and shares the sessions, so tests don't trip the login rate limit.
for (const [who, user, path] of [
  ['admin', ADMIN, STORAGE_STATE],
  ['viewer', VIEWER, VIEWER_STATE],
] as const) {
  setup(`sign in as ${who}`, async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=email]', user.email);
    await page.fill('input[name=password]', user.password);
    await page.click('button[type=submit]');
    await page.waitForSelector('[data-testid=fleet-grid]');
    await page.context().storageState({ path });
  });
}
