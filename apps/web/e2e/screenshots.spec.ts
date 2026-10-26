import { test, type Page } from '@playwright/test';

// Saves the current phase's screenshots for the PR: the fleet table with its column groups,
// grouping, an opened row, saved views and filters, EN and HE, desktop and phone. Earlier
// phases keep their own folders.
const OUT = '../../docs/screenshots/phase-5';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

async function table(page: Page, query = '') {
  await page.goto(`/fleet${query}`);
  await page.getByTestId('fleet-grid').waitFor();
  await page.waitForTimeout(700);
}

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        storageState: 'test-results/.auth/admin.json',
      });
      await context.addInitScript((l) => localStorage.setItem('fh.lang', l), lang);
      const page = await context.newPage();
      const shot = (name: string) =>
        page.screenshot({ path: `${OUT}/${name}-${lang}-${sizeName}.png` });
      await page.request.put('/api/me/preferences', {
        headers: { origin: 'http://localhost:5173' },
        data: { fleetViewId: null },
      });

      await table(page);
      await shot('fleet-table');

      // Scrolled sideways to the compliance and cost columns, with one row opened.
      await page.locator('tr[data-row="EX-102"]').getByTestId('expand-row').click();
      await page.getByTestId('detail-EX-102').locator('li').first().waitFor();
      await page.getByTestId('fleet-scroller').evaluate((el, rtl) => {
        el.scrollLeft = (rtl ? -1 : 1) * el.scrollWidth;
      }, lang === 'he');
      await page.waitForTimeout(300);
      await shot('row-detail');

      await table(page);
      await page.getByTestId('views-menu').click();
      await page.waitForTimeout(200);
      await shot('saved-views');
      await page.keyboard.press('Escape');

      if (sizeName === 'desktop') {
        const select = page.getByLabel(lang === 'he' ? 'קיבוץ לפי' : 'Group by');
        await select.selectOption('type');
        await page.waitForTimeout(300);
        await shot('grouped-by-type');
        await page.getByTestId('group-compliance').click();
        await page.waitForTimeout(200);
        await shot('column-group-menu');
      } else {
        await page.getByTestId('filters-button').click();
        await page.getByTestId('sheet').waitFor();
        await page.waitForTimeout(300);
        await shot('filters');
      }
      await context.close();
    });
  }
}
