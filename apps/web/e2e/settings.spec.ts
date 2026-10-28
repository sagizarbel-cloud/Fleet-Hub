import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { SIGNED_OUT, VIEWER_STATE } from './helpers';

const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

// Phase 7: add/edit stepper, settings lists, users and reset links, Excel import. All values fake.
const stamp = () => String(Date.now()).slice(-6);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** An .xlsx file, as Excel would save it. */
async function xlsx(sheet: string, rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function stepThrough(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) await page.getByTestId('vehicle-next').click();
}

test.describe('add and edit a vehicle', () => {
  test('the stepper checks the VIN and plate, and the new tile grows into the grid', async ({
    page,
  }) => {
    const serial = `E2E-${stamp()}`;
    await page.goto('/');
    await page.getByTestId('add-vehicle').click();
    const sheet = page.getByTestId('sheet');
    await page.getByTestId('vehicle-next').click();
    await expect(sheet).toContainText('Choose a vehicle type.');
    await page.getByTestId('type-picker').getByText('Pickup', { exact: true }).click();
    await page.getByTestId('vehicle-next').click();

    await sheet.getByLabel('Serial No.').fill(serial.toLowerCase());
    await expect(sheet.getByLabel('Serial No.')).toHaveValue(serial);
    await sheet.getByLabel('VIN / Chassis No.').fill('ABC123');
    await expect(sheet).toContainText('6 of 17 characters.');
    await sheet.getByLabel('License No.').fill('12-345');
    await sheet.getByLabel('Make').fill('Test');
    await sheet.getByLabel('Model').fill('Pickup');
    await page.getByTestId('vehicle-next').click();
    await expect(sheet).toContainText('A VIN has 17 letters and digits');
    await expect(sheet).toContainText('An Israeli license has 7 or 8 digits.');

    // A made-up VIN and plate.
    await sheet.getByLabel('VIN / Chassis No.').fill(`FAKEVHN${stamp()}0000`.slice(0, 17));
    await sheet.getByLabel('License No.').fill(`9${stamp()}`);
    await stepThrough(page, 4);
    await page.getByTestId('vehicle-save').click();
    await expect(sheet).toBeHidden();

    await expect(page).toHaveURL(/\/$/);
    const tile = page.locator(`[data-tile="${serial}"]`);
    await expect(tile).toBeVisible();
    await expect(page.locator('li[data-new]')).toHaveCount(1);
  });

  test('editing names the changed fields, and photos replace the drawing on the vehicle page', async ({
    page,
  }) => {
    await page.goto('/vehicles/PU-902');
    await page.getByTestId('edit-vehicle').click();
    const sheet = page.getByTestId('sheet');
    const model = sheet.getByLabel('Model');
    await expect(model).not.toHaveValue('');
    const next = `Hilux ${stamp()}`;
    await model.fill(next);
    await sheet.getByRole('button', { name: /Photo or drawing/ }).click();
    await sheet.locator('[data-slot=top] input[type=file]').setInputFiles({
      name: 'top.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await sheet.locator('[data-slot=side] input[type=file]').setInputFiles({
      name: 'side.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.getByTestId('vehicle-save').click();
    await expect(sheet).toBeHidden();

    await expect(page.getByRole('heading', { level: 1 })).toContainText(next);
    await expect(page.getByTestId('vehicle-stage')).toContainText('Vehicle details updated: Model');
    await expect(page.locator('[data-pictures=photo] img')).toHaveCount(2);

    // Back to the drawing, so other tests see the seeded look.
    await page.getByTestId('edit-vehicle').click();
    await sheet.getByRole('button', { name: /Photo or drawing/ }).click();
    for (const slot of ['top', 'side'])
      await sheet.locator(`[data-slot=${slot}]`).getByRole('button', { name: 'Remove' }).click();
    await page.getByTestId('vehicle-save').click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-pictures]')).toHaveCount(0);
  });
});

test.describe('settings', () => {
  test('lists: add a value in both languages, hide it, delete it', async ({ page }) => {
    const code = `e2e_${stamp()}`;
    await page.goto('/settings/lists');
    await page.getByRole('tab', { name: /Locations/ }).click();
    await page.getByRole('button', { name: 'Add value' }).click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByLabel('English name').fill(`E2E yard ${code}`);
    await sheet.getByLabel('Hebrew name').fill('חצר בדיקה');
    await sheet.getByLabel('Code').fill(code);
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();

    const row = page.getByTestId('lookup-table').locator('tr', { hasText: code });
    await expect(row).toContainText('חצר בדיקה');
    await row.getByRole('checkbox').click();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await expect(row).toContainText('Hidden');
    await row.getByRole('button', { name: /^Delete E2E yard/ }).click();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0);
  });

  test('users: a new user gets a one-time link that sets a password once', async ({
    page,
    browser,
  }) => {
    const email = `e2e.${stamp()}@fleethub.test`;
    await page.goto('/settings/users');
    await page.getByRole('button', { name: 'Add user' }).click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByLabel('Name').fill('E2E Person');
    await sheet.getByLabel('Email').fill(email);
    await sheet.getByRole('button', { name: 'Add and get link' }).click();
    await expect(page.getByTestId('reset-link')).toContainText('It works once');
    const url = (await page.getByTestId('reset-url').textContent())!;
    await expect(page.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=.*reset/,
    );

    const other = await browser.newContext({ storageState: SIGNED_OUT });
    const guest = await other.newPage();
    await guest.goto(url);
    await expect(guest.getByText('Hi E2E Person')).toBeVisible();
    await guest.getByLabel('New password', { exact: true }).fill('a long enough password');
    await guest.getByLabel('New password again').fill('a long enough password');
    await guest.getByRole('button', { name: 'Save password' }).click();
    await expect(guest.getByTestId('reset-done')).toBeVisible();
    await guest.goto(url);
    await expect(guest.getByTestId('reset-invalid')).toBeVisible();
    await other.close();
  });

  test('import: a sheet with Hebrew headers runs dry, then imports with marked events', async ({
    page,
  }) => {
    const day = `${String(1 + (Date.now() % 27)).padStart(2, '0')}/01/2026`;
    const liters = 100 + (Date.now() % 300);
    const buffer = await xlsx('דלק', [
      ['כלי', 'תאריך', 'ליטרים', 'עלות'],
      ['PU-902', day, liters, '₪ 700'],
      ['NOPE-1', day, 10, 70],
    ]);

    await page.goto('/settings/import');
    await page.getByTestId('import-file').setInputFiles({
      name: 'fuel.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    await page.getByTestId('import-target').selectOption('fuel');
    await expect(page.locator('[data-field=serial]')).toHaveValue('0');
    await expect(page.locator('[data-field=liters]')).toHaveValue('2');
    await page.getByTestId('import-preview').click();
    const results = page.getByTestId('import-results');
    await expect(results.locator('[data-action=create]')).toHaveCount(1);
    await expect(results.locator('[data-action=error]')).toContainText(': not found');
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-done')).toBeVisible();

    await page.goto('/vehicles/PU-902');
    await expect(page.locator('[data-imported]').first()).toBeVisible();
  });

  test('import: a hand-kept sheet with a title, plates and a totals row', async ({ page }) => {
    await page.goto('/settings/import');
    await page.getByTestId('import-file').setInputFiles('../../docs/samples/service-log.xlsx');
    await page.getByTestId('import-target').selectOption('service');
    await expect(page.getByTestId('import-header-row')).toHaveValue('3');
    await page.getByTestId('import-preview').click();
    const results = page.getByTestId('import-results');
    await expect(results.locator('[data-action=create]')).toHaveCount(4);
    await expect(results.locator('[data-action=summary]')).toHaveCount(1);
    await expect(results.locator('[data-action=error]')).toContainText('11-111-11');
  });
});

test.describe('as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('sees only their own settings and no Add button', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('link', { name: 'Lists' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Excel import' })).toHaveCount(0);
    await expect(page.getByTestId('add-vehicle')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  });
});
