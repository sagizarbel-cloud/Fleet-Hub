import { test, type Browser, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { SIGNED_OUT } from './helpers';

const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

// Saves the current phase's screenshots for the PR: my settings, lists, users and a reset link,
// the add-vehicle stepper, photos on the vehicle page, and an Excel import dry run, EN and HE,
// desktop and phone. Earlier phases keep their own folders.
const OUT = '../../docs/screenshots/phase-7';
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

/** A made-up photo, drawn in the page, so the photo style has something to show. */
const fakePhoto = (page: Page, label: string, hue: number) =>
  page.evaluate(
    ([text, h]) => {
      const c = document.createElement('canvas');
      c.width = 960;
      c.height = 600;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 960, 600);
      grad.addColorStop(0, `hsl(${h} 30% 35%)`);
      grad.addColorStop(1, `hsl(${h} 25% 15%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 960, 600);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = 'bold 72px sans-serif';
      g.textAlign = 'center';
      g.fillText(text, 480, 320);
      return c.toDataURL('image/png').split(',')[1]!;
    },
    [label, hue] as const,
  );

async function fuelSheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('דלק');
  for (const r of [
    ['כלי', 'תאריך', 'ליטרים', 'עלות'],
    ['PU-902', '03/01/2026', 62, '₪ 430'],
    ['EX-102', '04/01/2026', 210, '₪ 1,460'],
    ['NOPE-1', '05/01/2026', 10, 70],
  ])
    ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { context, page } = await newPage(browser, viewport, lang);
      // The account's saved language wins over this device's.
      await page.request.put('/api/me/preferences', { data: { language: lang } });
      const shot = (name: string, p = page) =>
        p.screenshot({ path: `${OUT}/${name}-${lang}-${sizeName}.png` });
      const sheet = page.getByTestId('sheet');
      const settle = async () => {
        await sheet.waitFor();
        await page.waitForTimeout(300);
      };
      const close = async () => {
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached' });
      };

      await open(page, '/settings', 'pinned-vitals');
      await shot('settings-mine');
      await open(page, '/settings/lists', 'lookup-table');
      await shot('settings-lists');

      await open(page, '/settings/users', 'users');
      await shot('settings-users');
      await page
        .locator('[data-user="viewer@fleethub.test"]')
        .getByRole('button', { name: /Reset link|קישור איפוס/ })
        .click();
      await page.getByTestId('reset-link').waitFor();
      await page.waitForTimeout(300);
      await shot('reset-link');
      const url = (await page.getByTestId('reset-url').textContent())!;
      await close();

      // The page the link opens, signed out.
      const guest = await newPage(browser, viewport, lang, SIGNED_OUT);
      await guest.page.goto(url);
      await guest.page.getByRole('button').last().waitFor();
      await guest.page.waitForTimeout(500);
      await shot('reset-page', guest.page);
      await guest.context.close();

      // The add-vehicle stepper: the type, then the details.
      await open(page, '/', 'fleet-grid');
      await page.getByTestId('add-vehicle').click();
      await settle();
      await page.getByTestId('type-picker').locator('button, label').nth(2).click();
      await shot('vehicle-add-type');
      await page.getByTestId('vehicle-next').click();
      await page.waitForTimeout(300);
      await shot('vehicle-add-details');
      await close();

      // Photos on the vehicle page: the top photo, with the side photo fading in over it.
      await open(page, '/vehicles/PU-902', 'vehicle-stage');
      await page.getByTestId('edit-vehicle').click();
      await settle();
      await sheet.getByRole('button', { name: /Photo or drawing|תמונה או שרטוט/ }).click();
      for (const [slot, label, hue] of [
        ['top', 'TOP', 45],
        ['side', 'SIDE', 0],
      ] as const)
        await sheet.locator(`[data-slot=${slot}] input[type=file]`).setInputFiles({
          name: `${slot}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from(await fakePhoto(page, label, hue), 'base64'),
        });
      await page.waitForTimeout(500);
      await shot('vehicle-edit-photos');
      await page.getByTestId('vehicle-save').click();
      await sheet.waitFor({ state: 'detached' });
      await page.locator('[data-pictures=photo] img').first().waitFor();
      await page.waitForTimeout(1200);
      await shot('vehicle-photos');
      // Back to the drawing.
      await page.getByTestId('edit-vehicle').click();
      await settle();
      await sheet.getByRole('button', { name: /Photo or drawing|תמונה או שרטוט/ }).click();
      for (const slot of ['top', 'side'])
        await sheet
          .locator(`[data-slot=${slot}]`)
          .getByRole('button', { name: /^(Remove|הסרה)$/ })
          .click();
      await page.getByTestId('vehicle-save').click();
      await sheet.waitFor({ state: 'detached' });

      // Excel import: a sheet with Hebrew headers, checked without saving.
      await open(page, '/settings/import', 'import-drop');
      await page.getByTestId('import-file').setInputFiles({
        name: 'fuel.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: await fuelSheet(),
      });
      await page.getByTestId('import-target').selectOption('fuel');
      await page.getByTestId('import-mapping').waitFor();
      await page.waitForTimeout(300);
      await shot('import-mapping');
      await page.getByTestId('import-preview').click();
      await page.getByTestId('import-results').waitFor();
      await page.waitForTimeout(300);
      await page.getByTestId('import-results').scrollIntoViewIfNeeded();
      await shot('import-dry-run');

      await page.request.put('/api/me/preferences', { data: { language: null } });
      await context.close();
    });
  }
}
