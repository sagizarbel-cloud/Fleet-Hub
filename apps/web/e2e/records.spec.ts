import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { VIEWER_STATE, toggleLanguage } from './helpers';

// SPEC 5.3 record panels, A7 status, A8 exports, against the seeded fleet.
const LOADER = 'WL-401';
const PICKUP = 'PU-901'; // its fuel log has one planted sudden drop
const ORIGIN = { origin: 'http://localhost:5173' };
// A 1×1 PNG, enough for the upload and thumbnail path.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openPanel(page: Page, serial: string, panel: string) {
  await page.goto(`/vehicles/${serial}?panel=${panel}`);
  await expect(page.getByTestId(`records-${panel}`)).toBeVisible();
}

// Loaded with require: Playwright's ESM loader trips over ExcelJS's CommonJS dependencies.
const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

async function readExport(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('export').click();
  const file = await download;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.read(await file.createReadStream());
  return { name: file.suggestedFilename(), sheet: wb.worksheets[0]! };
}

test.describe('record panels', () => {
  test('add a service with a photo, edit it, delete it and Undo', async ({ page }) => {
    const text = `E2E brake check ${Date.now()}`;
    await openPanel(page, LOADER, 'service');
    const total = page.getByTestId('record-total');
    const before = await total.textContent();

    await page.getByTestId('add-record').click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Required.')).toBeVisible();

    await sheet.getByLabel('Description').fill(text);
    await sheet.getByLabel('Cost').fill('480');
    await page.getByTestId('file-input').setInputFiles({
      name: 'invoice.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(sheet.getByText('invoice.png')).toBeVisible();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();

    const row = page.getByTestId('record-table').locator('tr', { hasText: text });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid=attachments] img')).toHaveCount(1);
    await expect(total).not.toHaveText(before ?? '');

    // Edit
    await row.getByRole('button', { name: 'Edit' }).click();
    await sheet.getByLabel('Cost').fill('520');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();
    await expect(row).toContainText('520');

    // Delete, then Undo within the 30 s
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden();
    const undo = page.getByTestId('undo-bar');
    await expect(undo).toContainText('Service deleted');
    await undo.getByRole('button', { name: 'Undo' }).click();
    await expect(row).toBeVisible();
    await expect(undo).toBeHidden();

    // The timeline shows the add, the edit, the delete and the restore.
    const activity = page.getByRole('complementary');
    await expect(activity.getByText(`Service restored: Service: \u2068${text}\u2069`)).toBeVisible();

    // Clean up so reruns start from the seed.
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden();
  });

  test('a critical malfunction turns the vehicle red, and deleting it turns it back', async ({
    page,
  }) => {
    await openPanel(page, 'EX-101', 'malfunctions');
    const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
    await expect(header.getByText('Operational', { exact: true })).toBeVisible();
    await page.getByTestId('add-record').click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByLabel('Severity').selectOption('CRITICAL');
    await sheet.getByLabel('Description').fill('E2E engine will not start');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(header.getByText('Inoperable', { exact: true })).toBeVisible();

    const row = page.getByTestId('record-table').locator('tr', { hasText: 'E2E engine' });
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(header.getByText('Operational', { exact: true })).toBeVisible();
  });

  test('the fuel chart shows economy and flags the sudden drop', async ({ page }) => {
    await openPanel(page, PICKUP, 'fuel');
    const chart = page.getByTestId('fuel-chart');
    await expect(chart).toContainText('km/L');
    await expect(chart).toContainText('Sudden drops: 1');
    await expect(chart.locator('[data-drop]')).toHaveCount(1);
    await page.getByLabel('Sudden drops only').check();
    await expect(page.getByTestId('record-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('record-table')).toContainText('Sudden drop');
  });

  test('exports the panel in English, and in Hebrew as a right-to-left sheet', async ({ page }) => {
    await openPanel(page, PICKUP, 'fuel');
    const en = await readExport(page);
    expect(en.name).toMatch(/^PU-901 fuel \d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(en.sheet.views[0]?.rightToLeft).toBeFalsy();
    expect(en.sheet.getRow(4).values).toEqual(
      expect.arrayContaining(['Date', 'Litres (L)', 'Economy (km/L)', 'Cost (₪)']),
    );
    expect(en.sheet.getCell('A5').value).toBeInstanceOf(Date);
    expect(en.sheet.rowCount).toBeGreaterThan(10);

    await toggleLanguage(page);
    await expect(page.getByTestId('export')).toHaveText('ייצוא לאקסל');
    const he = await readExport(page);
    expect(he.sheet.views[0]?.rightToLeft).toBe(true);
    expect(he.sheet.getCell('A1').value).toBe('צריכת דלק');
    expect(he.sheet.getRow(4).values).toEqual(expect.arrayContaining(['תאריך', 'עלות (₪)']));
    await toggleLanguage(page);
  });

  test('admins can set the status by hand and go back to automatic', async ({ page }) => {
    await page.goto(`/vehicles/TK-801`);
    await page.getByRole('button', { name: 'Set the status by hand' }).click();
    const form = page.getByTestId('status-override');
    await form.locator('label', { hasText: 'Has issues' }).click();
    await form.getByLabel('Reason (required)').fill('E2E waiting for a part');
    await form.getByRole('button', { name: 'Set status' }).click();
    await expect(page.getByText('Manual', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Set the status by hand' }).click();
    await form.getByRole('button', { name: 'Back to automatic' }).click();
    await expect(page.getByText('Manual', { exact: true })).toBeHidden();
  });

  test('ownership opens with its fields and documents list their receipts', async ({ page }) => {
    await openPanel(page, 'EX-101', 'ownership');
    await expect(page.getByTestId('records-ownership')).toContainText('Purchase price');
    await openPanel(page, 'EX-101', 'documents');
    await expect(page.getByTestId('records-documents').getByTestId('receipts-view')).toBeVisible();
    await expect(page.getByTestId('receipt-add')).toBeVisible();
  });
});

test.describe('as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('can read and export, add notes, but not other records', async ({ page }) => {
    await openPanel(page, LOADER, 'service');
    await expect(page.getByTestId('export')).toBeEnabled();
    await expect(page.getByTestId('add-record')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

    await openPanel(page, LOADER, 'notes');
    await page.getByTestId('add-record').click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByRole('textbox', { name: 'Note' }).fill('E2E viewer note');
    await sheet.getByRole('button', { name: 'Save' }).click();
    const row = page.getByTestId('record-table').locator('tr', { hasText: 'E2E viewer note' });
    await expect(row).toBeVisible();
    // Their own note: they may delete it.
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toBeHidden();
  });
});

test('record writes are refused for viewers by the API too', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: VIEWER_STATE });
  const res = await ctx.request.post(`/api/vehicles/${LOADER}/records/service`, {
    headers: ORIGIN,
    data: { date: '2026-01-01', description: 'nope' },
  });
  expect(res.status()).toBe(403);
  await ctx.close();
});
