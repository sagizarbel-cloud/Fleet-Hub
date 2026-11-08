import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { VIEWER_STATE } from './helpers';

// Wiggle tests (Sagi, 2026-11-08): heavy machinery only, V / X per item, history and Excel.
const LOADER = 'WL-401';
const EXCAVATOR = 'EX-101';
const PICKUP = 'PU-901';
const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

async function openPanel(page: Page, serial: string) {
  await page.goto(`/vehicles/${serial}?panel=wiggleTests`);
  await expect(page.getByTestId('records-wiggleTests')).toBeVisible();
}

test.describe('wiggle test', () => {
  test('only heavy machinery has the card; loader and excavator cameras differ', async ({
    page,
  }) => {
    await page.goto(`/vehicles/${PICKUP}`);
    await expect(page.locator('[data-record=service]')).toBeVisible();
    await expect(page.locator('[data-record=wiggleTests]')).toHaveCount(0);

    await openPanel(page, LOADER);
    await page.getByTestId('add-record').click();
    const list = page.getByTestId('wiggle-checklist');
    await expect(list).toHaveAttribute('data-profile', 'loader');
    for (const side of ['Front', 'Back', 'Left', 'Right', 'Cab'])
      await expect(list.locator(`[data-item=camera${side}]`)).toBeVisible();
    await expect(list.locator('[data-item=cameraFrontDown]')).toHaveCount(0);
    // Fluids and mechanical answers read as words, not V / X.
    await expect(list.locator('[data-item=fluids] [data-result=FAIL]')).toHaveText('Missing');
    await expect(list.locator('[data-item=mechanical] [data-result=FAIL]')).toHaveText(
      'Requires attention',
    );
    await page.getByTestId('sheet').getByRole('button', { name: 'Cancel' }).click();

    await openPanel(page, EXCAVATOR);
    await page.getByTestId('add-record').click();
    await expect(list).toHaveAttribute('data-profile', 'excavator');
    await expect(list.locator('[data-item=cameraFrontDown]')).toBeVisible();
    await expect(list.locator('[data-item=cameraCab]')).toHaveCount(0);
    for (const item of [
      'steering',
      'cameras',
      'lidars',
      'imus',
      'signal',
      'instruments',
      'hydraulicTools',
    ])
      await expect(list.locator(`[data-item=${item}]`)).toBeVisible();
  });

  test('every item needs V or X; an X offers a malfunction report; history exports', async ({
    page,
  }) => {
    const note = `E2E wiggle ${Date.now()}`;
    await openPanel(page, LOADER);
    await page.getByTestId('add-record').click();
    const sheet = page.getByTestId('sheet');
    const list = page.getByTestId('wiggle-checklist');
    await list.locator('[data-item=steering] [data-result=PASS]').click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Every item needs a V or an X.')).toBeVisible();

    await page.getByTestId('wiggle-all-ok').click();
    await list.locator('[data-item=cameraBack] [data-result=FAIL]').click();
    await expect(list.locator('[data-item=cameraBack] [data-result=FAIL]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByLabel('Other problems').fill(note);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();

    const row = page.getByTestId('record-table').locator('tr', { hasText: note });
    await expect(row).toContainText('Not OK: 1');
    await expect(row).toContainText('Back camera');

    // An X: the editor is offered a malfunction report, its text filled in.
    await page.getByTestId('wiggle-report').click();
    await expect(sheet.locator('[data-kind=malfunctions]')).toBeVisible();
    await expect(sheet.getByLabel('Description')).toHaveValue(new RegExp(note));
    await sheet.getByRole('button', { name: 'Cancel' }).click();

    // The report shows each item as V or X.
    await row.locator('td').first().getByRole('button').click();
    const report = page.getByTestId('record-report');
    await expect(report).toContainText('Cab camera');
    await expect(report).toContainText('Wiggle test, not OK: Back camera');
    await page.keyboard.press('Escape');

    // Only the tests with an X, then the export of this vehicle's history.
    await page.getByLabel('With an X only').check();
    const download = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(await (await download).createReadStream());
    const ws = wb.worksheets[0]!;
    const headers = (ws.getRow(4).values as unknown[]).filter(Boolean);
    expect(headers).toEqual(
      expect.arrayContaining([
        'Done at',
        'Result',
        'Done by',
        'Steers correctly both ways',
        'Cab camera',
        'Fluids',
      ]),
    );
    expect(headers).not.toContain('Front-down camera');
    const rows = ws.getSheetValues().slice(5).filter(Boolean) as unknown[][];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.some((c) => typeof c === 'string' && c.startsWith('Not OK')))).toBe(
      true,
    );
    expect(rows.some((r) => r.includes(note))).toBe(true);
  });
});

test.describe('wiggle test from a PC', () => {
  test('keyboard V / Y and X / N answer the highlighted item and move on', async ({ page }) => {
    await openPanel(page, EXCAVATOR);
    await page.getByTestId('add-record').click();
    const list = page.getByTestId('wiggle-checklist');
    await expect(list.locator('[data-current]')).toHaveAttribute('data-item', 'steering');
    await page.keyboard.press('v');
    await page.keyboard.press('y');
    await page.keyboard.press('n');
    const checked = (item: string, r: string) =>
      expect(list.locator(`[data-item=${item}] [data-result=${r}]`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    await checked('steering', 'PASS');
    await checked('cameras', 'PASS');
    await checked('cameraFrontDown', 'FAIL');
    await expect(list.locator('[data-current]')).toHaveAttribute('data-item', 'lidars');
    // Typing in the notes doesn't answer anything.
    await page.getByTestId('sheet').getByLabel('Other problems').pressSequentially('xv');
    await expect(list.locator('[data-current]')).toHaveAttribute('data-item', 'lidars');
  });

  test('the controller logo button: once is V, twice within 0.5 s is X', async ({ page }) => {
    // A stand-in controller: button 16 is the logo ("home") button of the standard layout.
    await page.addInitScript(() => {
      const w = window as unknown as { __logo: boolean };
      w.__logo = false;
      navigator.getGamepads = () =>
        [
          {
            id: 'Logitech test pad',
            index: 0,
            connected: true,
            buttons: Array.from({ length: 17 }, (_, i) => ({
              pressed: i === 16 && w.__logo,
              touched: false,
              value: 0,
            })),
          },
        ] as unknown as (Gamepad | null)[];
    });
    const press = async () => {
      await page.evaluate(() => ((window as unknown as { __logo: boolean }).__logo = true));
      await page.waitForTimeout(60);
      await page.evaluate(() => ((window as unknown as { __logo: boolean }).__logo = false));
      await page.waitForTimeout(60);
    };
    await openPanel(page, EXCAVATOR);
    await page.getByTestId('add-record').click();
    const list = page.getByTestId('wiggle-checklist');
    await expect(page.getByTestId('wiggle-controller')).toHaveAttribute('data-connected', 'true');
    await press();
    await expect(list.locator('[data-item=steering] [data-result=PASS]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await press();
    await press();
    await expect(list.locator('[data-item=cameras] [data-result=FAIL]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(list.locator('[data-current]')).toHaveAttribute('data-item', 'cameraFrontDown');
  });
});

test.describe('wiggle test as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });
  test('a viewer does one, with no malfunction offer', async ({ page }) => {
    await openPanel(page, EXCAVATOR);
    await page.getByTestId('add-record').click();
    await page.getByTestId('wiggle-all-ok').click();
    await page
      .getByTestId('wiggle-checklist')
      .locator('[data-item=cameras] [data-result=FAIL]')
      .click();
    await page.getByTestId('sheet').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('sheet')).toBeHidden();
    await expect(page.getByTestId('record-table').locator('tr').nth(1)).toContainText('Cameras');
    await expect(page.getByTestId('wiggle-offer')).toHaveCount(0);
  });
});
