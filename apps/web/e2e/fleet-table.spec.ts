import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { VIEWER_STATE } from './helpers';

// SPEC 5.4 fleet table, against the seeded fleet (17 vehicles).
const SEEDED = 17;
const ORIGIN = { origin: 'http://localhost:5173' };

// Loaded with require: Playwright's ESM loader trips over ExcelJS's CommonJS dependencies.
const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

const rows = (page: Page) => page.getByTestId('fleet-grid').locator('tbody tr[data-row]');

async function openTable(page: Page, query = '') {
  await page.goto(`/fleet${query}`);
  await expect(page.getByTestId('fleet-grid')).toBeVisible();
}

async function download(page: Page, scope: 'view' | 'fleet') {
  const done = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId(`export-${scope}`).click();
  const file = await done;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.read(await file.createReadStream());
  return { name: file.suggestedFilename(), wb };
}

// Every test opens the built-in view, and leaves no saved views of its own behind.
async function cleanUp(page: Page) {
  await page.request.put('/api/me/preferences', { headers: ORIGIN, data: { fleetViewId: null } });
  const { items } = await (await page.request.get('/api/fleet/views')).json();
  for (const v of items as { id: string; name: string }[]) {
    if (v.name.startsWith('E2E '))
      await page.request.delete(`/api/fleet/views/${v.id}`, { headers: ORIGIN });
  }
}

test.describe('fleet table', () => {
  test.beforeEach(async ({ page }) => cleanUp(page));
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: 'test-results/.auth/admin.json' });
    await cleanUp(page);
    await page.close();
  });
  test('lists every vehicle with its drawing, and searches, filters and groups', async ({
    page,
  }) => {
    await openTable(page);
    await expect(page.getByTestId('fleet-count')).toHaveText(`${SEEDED} of ${SEEDED} vehicles`);
    const first = rows(page).first();
    await expect(first.locator('[data-tile-visual] svg')).toBeVisible();

    const count = page.getByTestId('fleet-count');
    await page.getByTestId('fleet-search').fill('hilux');
    await expect(count).toHaveText(`2 of ${SEEDED} vehicles`);
    await expect(rows(page)).toHaveCount(2);
    await page.getByTestId('fleet-search').fill('');

    await page.getByRole('button', { name: 'Inoperable' }).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: 'Inoperable' })).toHaveCount(2);

    // Filters live in the URL, so a reload keeps them.
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(count).toHaveText(`${SEEDED} of ${SEEDED} vehicles`);

    await page.getByLabel('Group by').selectOption('type');
    const groups = page.getByTestId('table-group');
    await expect(groups.filter({ hasText: 'Pickup' })).toContainText('3 vehicles');
    await expect(page.locator('tr[data-row="PU-901"]')).toBeVisible();
    await groups.filter({ hasText: 'Pickup' }).click();
    await expect(page.locator('tr[data-row="PU-901"]')).toHaveCount(0);
  });

  test('sorts, and each column group collapses or picks its columns', async ({ page }) => {
    await openTable(page);
    const header = page.getByTestId('fleet-grid').locator('thead');
    await header.getByRole('button', { name: 'Readiness', exact: true }).click();
    await expect(rows(page).first()).toContainText('0%');
    await expect(header.locator('th[aria-sort="ascending"]')).toContainText('Readiness');

    await page.getByTestId('group-identity').click();
    await page.getByRole('button', { name: 'Collapse to one column' }).click();
    await expect(header.getByRole('button', { name: 'Make', exact: true })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Type', exact: true })).toBeVisible();

    await page.getByTestId('group-identity').click();
    // The URL update re-renders the box, so click and then wait for it, rather than check().
    const vin = page.getByRole('checkbox', { name: 'VIN / Chassis No.' });
    await vin.click();
    await expect(vin).toBeChecked();
    await expect(header.getByRole('button', { name: 'VIN / Chassis No.' })).toBeVisible();
    // Picking a column opens the group again.
    await expect(header.getByRole('button', { name: 'Make', exact: true })).toBeVisible();
  });

  test('a row opens in place with services, malfunctions and items', async ({ page }) => {
    await openTable(page);
    const row = page.locator('tr[data-row="EX-102"]');
    await row.getByTestId('expand-row').click();
    const detail = page.getByTestId('detail-EX-102');
    await expect(detail).toContainText('Latest services');
    await expect(detail).toContainText('Open malfunctions');
    await expect(detail.locator('li').first()).toBeVisible();
  });

  test('clicking a row flies into the vehicle, and Back returns to the same table', async ({
    page,
  }) => {
    await openTable(page, '');
    await page.getByTestId('fleet-search').fill('PU-90');
    await page.locator('tr[data-row="PU-902"] td').nth(2).click();
    await expect(page).toHaveURL(/\/vehicles\/PU-902$/);
    await expect(page.getByRole('heading', { level: 1, name: /Triton/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to the fleet table' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/fleet\?s=/);
    await expect(page.getByTestId('fleet-search')).toHaveValue('PU-90');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('[data-tile="PU-902"]')).toBeFocused();
  });

  test('saves a shared view, opens with it by default, and deletes it', async ({ page }) => {
    const name = `E2E view ${Date.now()}`;
    await openTable(page);
    await page.getByRole('button', { name: 'Has issues' }).click();
    await page.getByTestId('views-menu').click();
    await page.getByTestId('view-save-new').click();
    await page.getByTestId('view-name').fill(name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('views-menu')).toContainText(name);
    await expect(page).toHaveURL(/view=/);
    await expect(page).not.toHaveURL(/s=/);

    // Make it this user's default, then open the bare page.
    await page.getByTestId('views-menu').click();
    await page.getByRole('button', { name: `Open the table with ${name}` }).click();
    await page.keyboard.press('Escape');
    await openTable(page);
    await expect(page.getByTestId('views-menu')).toContainText(name);
    await expect(rows(page).filter({ hasNotText: 'Has issues' })).toHaveCount(0);

    await page.getByTestId('views-menu').click();
    await page.getByTestId('view-delete').click();
    await page.getByTestId('view-delete-confirm').click();
    await expect(page.getByTestId('views-menu')).toContainText('All vehicles');
    await expect(page.getByTestId('fleet-count')).toHaveText(`${SEEDED} of ${SEEDED} vehicles`);
  });

  test('exports the current view, and the whole fleet as one sheet per record type', async ({
    page,
  }) => {
    await openTable(page);
    await page.getByRole('button', { name: 'Inoperable' }).click();
    const view = await download(page, 'view');
    expect(view.name).toMatch(/^fleet view \d{4}-\d{2}-\d{2}\.xlsx$/);
    const sheet = view.wb.worksheets[0]!;
    expect(sheet.getRow(4).values).toEqual(
      expect.arrayContaining(['Serial No.', 'Type', 'Status', 'Odometer (km)', 'Engine hours (h)']),
    );
    expect(sheet.rowCount).toBe(4 + 2);
    expect(sheet.getCell('A5').value).toMatch(/^[A-Z]{2}-\d{3}$/);

    const fleet = await download(page, 'fleet');
    const names = fleet.wb.worksheets.map((w) => w.name);
    expect(names).toEqual([
      'Vehicles',
      'Service history',
      'Malfunctions & accidents',
      'Fluid additions',
      'Fuel economy',
      'Location changes',
      'Inspections & compliance',
      'Notes',
      'Assigned items',
    ]);
    expect(fleet.wb.getWorksheet('Vehicles')!.rowCount).toBe(4 + SEEDED);
    expect(fleet.wb.getWorksheet('Service history')!.getRow(4).values).toEqual(
      expect.arrayContaining(['Serial No.', 'Date']),
    );
    const all = JSON.stringify(fleet.wb.worksheets.map((w) => w.getSheetValues()));
    expect(all).not.toMatch(/start ?code/i);

    await page.getByTestId('language-toggle').click();
    const he = await download(page, 'view');
    expect(he.wb.worksheets[0]!.views[0]?.rightToLeft).toBe(true);
    expect(he.wb.worksheets[0]!.getCell('A1').value).toBe('טבלה מרוכזת');
    await page.getByTestId('language-toggle').click();
  });

  test('draws only the visible rows of a 500-vehicle fleet', async ({ page }) => {
    const real = await page.request.get('/api/fleet/table');
    const [sample] = (await real.json()).rows;
    const big = Array.from({ length: 500 }, (_, i) => ({
      ...sample,
      serial: `ZZ-${String(i).padStart(3, '0')}`,
    }));
    await page.route('**/api/fleet/table', (route) => route.fulfill({ json: { rows: big } }));
    await openTable(page);
    await expect(page.getByTestId('fleet-count')).toHaveText('500 of 500 vehicles');
    expect(await rows(page).count()).toBeLessThan(60);
    await page.getByTestId('fleet-scroller').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator('tr[data-row="ZZ-499"]')).toBeVisible();
  });
});

test.describe('as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('sees everyone’s views but can only change their own', async ({ page }) => {
    await openTable(page);
    await page.getByTestId('views-menu').click();
    await page.getByTestId('view-option').filter({ hasText: 'Due within 30 days' }).click();
    await expect(page.getByTestId('views-menu')).toContainText('Due within 30 days');
    await page.getByTestId('views-menu').click();
    await expect(page.getByTestId('view-delete')).toHaveCount(0);
    await expect(page.getByTestId('view-save-new')).toBeVisible();
  });
});

test('the table API never carries start codes', async ({ page }) => {
  const res = await page.request.get('/api/fleet/table', { headers: ORIGIN });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toMatch(/startCode/i);
});
