import { test } from '@playwright/test';

// Saves the current phase's screenshots for the PR: the dashboard and the transition's end
// state, EN and HE, desktop and phone. Earlier phases' screenshots stay in their own folders.
const OUT = '../../docs/screenshots/phase-2';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport,
        storageState: 'test-results/.auth/admin.json',
      });
      await context.addInitScript((l) => localStorage.setItem('fh.lang', l), lang);
      const page = await context.newPage();
      await page.goto('/');
      await page.waitForSelector('[data-tile]');
      await page.mouse.move(0, 0);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/dashboard-${lang}-${sizeName}.png` });
      if (sizeName === 'desktop') {
        await page.locator('[data-event-id]').nth(1).hover();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/dashboard-link-${lang}-${sizeName}.png` });
      }
      const tile = page.locator('[data-tile]').nth(4);
      await tile.scrollIntoViewIfNeeded();
      await tile.click();
      await page.waitForSelector('[data-pose=side]');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/vehicle-${lang}-${sizeName}.png` });
      await context.close();
    });
  }
}
