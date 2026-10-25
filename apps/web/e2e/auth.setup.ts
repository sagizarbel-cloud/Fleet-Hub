import { test as setup } from '@playwright/test';
import { ADMIN, STORAGE_STATE } from './helpers';

// Signs in once per run and shares the session, so tests don't trip the login rate limit.
setup('sign in as admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('#area-title');
  await page.context().storageState({ path: STORAGE_STATE });
});
