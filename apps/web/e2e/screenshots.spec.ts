import { test, type Browser, type Page } from '@playwright/test';
import { SIGNED_OUT } from './helpers';

// Saves the current phase's screenshots for the PR: every main screen after the translation and
// RTL audit, EN and HE, desktop and phone, dark (plus light for the dashboard and a vehicle).
// Earlier phases keep their own folders.
const OUT = '../../docs/screenshots/phase-8';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');
// One admin account, whose saved language each run changes.
test.describe.configure({ mode: 'serial' });

async function open(page: Page, path: string, ready: string) {
  await page.goto(path);
  await page.getByTestId(ready).first().waitFor();
  await page.waitForTimeout(700);
}

async function newPage(
  browser: Browser,
  viewport: { width: number; height: number },
  lang: string,
  storageState: string | typeof SIGNED_OUT = 'test-results/.auth/admin.json',
) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', storageState });
  await context.addInitScript((l) => localStorage.setItem('fh.lang', l), lang);
  return { context, page: await context.newPage() };
}

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { context, page } = await newPage(browser, viewport, lang);
      // The account's saved language wins over this device's.
      await page.request.put('/api/me/preferences', { data: { language: lang, theme: 'dark' } });
      const shot = (name: string) =>
        page.screenshot({ path: `${OUT}/${name}-${lang}-${sizeName}.png` });
      const sheet = page.getByTestId('sheet');
      const close = async () => {
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached' });
      };

      for (const theme of ['dark', 'light'] as const) {
        await page.request.put('/api/me/preferences', { data: { theme } });
        await open(page, '/', 'fleet-grid');
        await shot(`dashboard-${theme}`);
        await open(page, '/vehicles/EX-101', 'vitals');
        await shot(`vehicle-${theme}`);
      }
      await page.request.put('/api/me/preferences', { data: { theme: 'dark' } });

      await open(page, '/vehicles/EX-101?panel=fuel', 'fuel-chart');
      await shot('vehicle-fuel');
      await open(page, '/vehicles/EX-101?panel=service', 'record-panel');
      await shot('vehicle-service');
      await open(page, '/fleet', 'fleet-table');
      await shot('fleet-table');
      await open(page, '/receipts', 'receipts-view');
      await shot('receipts');
      await open(page, '/quotes', 'quotes-view');
      await shot('quotes');
      await page.getByTestId('quote-row').first().click();
      await sheet.waitFor();
      await page.waitForTimeout(300);
      await shot('quote-detail');
      await close();
      await open(page, '/equipment', 'item-table');
      await shot('equipment');
      await page.getByTestId('item-row').first().click();
      await sheet.waitFor();
      await page.waitForTimeout(300);
      await shot('item-detail');
      await close();
      await open(page, '/', 'fleet-grid');
      await page.getByTestId('add-vehicle').click();
      await sheet.waitFor();
      await page.getByTestId('type-picker').locator('button, label').nth(2).click();
      await page.getByTestId('vehicle-next').click();
      await page.getByTestId('vehicle-next').click();
      await page.waitForTimeout(300);
      await shot('vehicle-add-errors');
      await close();
      await open(page, '/settings', 'pinned-vitals');
      await shot('settings');

      await page.request.put('/api/me/preferences', { data: { language: null, theme: null } });
      await context.close();
    });
  }
}
