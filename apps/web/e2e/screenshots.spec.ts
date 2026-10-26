import { test, type Page } from '@playwright/test';

// Saves the current phase's screenshots for the PR: the record panels, a form, the fuel chart
// and the status override, EN and HE, desktop and phone. Earlier phases keep their own folders.
const OUT = '../../docs/screenshots/phase-4';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

async function panel(page: Page, serial: string, key: string) {
  await page.goto(`/vehicles/${serial}?panel=${key}`);
  const el = page.getByTestId('record-panel');
  await el.waitFor();
  await page.getByTestId(`records-${key}`).waitFor();
  await page.waitForTimeout(900);
  await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
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

      await panel(page, 'PU-901', 'fuel');
      await shot('fuel');
      await panel(page, 'EX-101', 'service');
      await shot('service');
      await panel(page, 'WL-401', 'malfunctions');
      await shot('malfunctions');
      await page.getByTestId('add-record').click();
      await page.getByTestId('sheet').waitFor();
      await page.waitForTimeout(300);
      await shot('malfunction-form');
      await page.keyboard.press('Escape');
      await panel(page, 'EX-101', 'inspections');
      await shot('inspections');
      if (sizeName === 'desktop') {
        await panel(page, 'EX-101', 'ownership');
        await shot('ownership');
        await page.goto('/vehicles/TK-801');
        await page.getByTestId('vitals').waitFor();
        const label = lang === 'he' ? 'קביעת סטטוס ידנית' : 'Set the status by hand';
        await page.getByRole('button', { name: label }).click();
        await page.getByTestId('status-override').waitFor();
        await shot('status-override');
      }
      await context.close();
    });
  }
}
