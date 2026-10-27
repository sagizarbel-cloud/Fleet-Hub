import { test, type Browser, type Page } from '@playwright/test';

// Saves the current phase's screenshots for the PR: receipts, price quotes and their comparison,
// equipment, and a file held over a dashboard tile, EN and HE, desktop and phone. Earlier phases
// keep their own folders.
const OUT = '../../docs/screenshots/phase-6';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

async function open(page: Page, path: string, ready: string) {
  await page.goto(path);
  await page.getByTestId(ready).first().waitFor();
  await page.waitForTimeout(700);
}

async function newPage(
  browser: Browser,
  viewport: { width: number; height: number },
  lang: string,
) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    storageState: 'test-results/.auth/admin.json',
  });
  await context.addInitScript((l) => localStorage.setItem('fh.lang', l), lang);
  return { context, page: await context.newPage() };
}

/** Holds a file over a dashboard tile, as a drag from the desktop would. */
const holdFile = (page: Page, serial: string) =>
  page.locator(`[data-tile="${serial}"]`).evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'receipt.pdf', { type: 'application/pdf' }));
    el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
  });

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { context, page } = await newPage(browser, viewport, lang);
      const shot = (name: string, p = page) =>
        p.screenshot({ path: `${OUT}/${name}-${lang}-${sizeName}.png` });

      await open(page, '/receipts', 'receipt-card');
      await shot('receipts');
      await page.getByTestId('receipt-add').click();
      await page.getByTestId('sheet').waitFor();
      await page.waitForTimeout(300);
      await shot('receipt-form');
      await page.keyboard.press('Escape');

      await open(page, '/quotes', 'quote-row');
      await shot('quotes');
      await page.getByTestId('quote-open').first().click();
      await page.getByTestId('quote-detail').waitFor();
      await page.waitForTimeout(300);
      await shot('quote-detail');
      await page.keyboard.press('Escape');
      await page.getByTestId('sheet').waitFor({ state: 'detached' });
      await page.getByTestId('quote-compare').click();
      await page.getByTestId('compare-line').first().waitFor();
      await page.waitForTimeout(300);
      await shot('compare-part');
      await page.keyboard.press('Escape');

      await open(page, '/equipment', 'item-row');
      await shot('equipment');

      // A file held over a tile: it grows and glows.
      await open(page, '/', 'fleet-grid');
      await page.getByTestId('tray-toggle').click();
      await page.getByTestId('tray-item').first().waitFor();
      await holdFile(page, 'EX-102');
      await page.waitForTimeout(400);
      await shot('tile-drop');
      await context.close();
    });
  }
}
