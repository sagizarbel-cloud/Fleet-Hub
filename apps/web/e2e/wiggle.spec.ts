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
  test('only heavy machinery has the card; loader and excavator steering checks differ', async ({
    page,
  }) => {
    await page.goto(`/vehicles/${PICKUP}`);
    await expect(page.locator('[data-record=service]')).toBeVisible();
    await expect(page.locator('[data-record=wiggleTests]')).toHaveCount(0);

    await openPanel(page, LOADER);
    await page.getByTestId('add-record').click();
    const list = page.getByTestId('wiggle-checklist');
    await expect(list).toHaveAttribute('data-profile', 'loader');
    await expect(list.locator('[data-item=articulation]')).toBeVisible();
    await expect(list.locator('[data-item=tracksTravel]')).toHaveCount(0);
    await page.getByTestId('sheet').getByRole('button', { name: 'Cancel' }).click();

    await openPanel(page, EXCAVATOR);
    await page.getByTestId('add-record').click();
    await expect(list).toHaveAttribute('data-profile', 'excavator');
    await expect(list.locator('[data-item=tracksTravel]')).toBeVisible();
    await expect(list.locator('[data-item=articulation]')).toHaveCount(0);
    for (const item of ['cameras', 'lidars', 'communications'])
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
    await list.locator('[data-item=articulation] [data-result=PASS]').click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Every item needs a V or an X.')).toBeVisible();

    await page.getByTestId('wiggle-all-ok').click();
    await list.locator('[data-item=lidars] [data-result=FAIL]').click();
    await expect(list.locator('[data-item=lidars] [data-result=FAIL]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByLabel('Other problems').fill(note);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();

    const row = page.getByTestId('record-table').locator('tr', { hasText: note });
    await expect(row).toContainText('Not OK: 1');
    await expect(row).toContainText('LiDARs');

    // An X: the editor is offered a malfunction report, its text filled in.
    await page.getByTestId('wiggle-report').click();
    await expect(sheet.locator('[data-kind=malfunctions]')).toBeVisible();
    await expect(sheet.getByLabel('Description')).toHaveValue(new RegExp(note));
    await sheet.getByRole('button', { name: 'Cancel' }).click();

    // The report shows each item as V or X.
    await row.locator('td').first().getByRole('button').click();
    const report = page.getByTestId('record-report');
    await expect(report).toContainText('LiDARs: clean and working');
    await expect(report).toContainText('Wiggle test, not OK: LiDARs: clean and working');
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
        'Articulation joint and pins: no play',
      ]),
    );
    expect(headers).not.toContain('Both tracks travel and steer');
    const rows = ws.getSheetValues().slice(5).filter(Boolean) as unknown[][];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.some((c) => typeof c === 'string' && c.startsWith('Not OK')))).toBe(
      true,
    );
    expect(rows.some((r) => r.includes(note))).toBe(true);
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
    await expect(page.getByTestId('record-table').locator('tr').nth(1)).toContainText(
      'Cameras: clear picture',
    );
    await expect(page.getByTestId('wiggle-offer')).toHaveCount(0);
  });
});
