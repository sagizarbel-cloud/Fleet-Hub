import { expect, test } from '@playwright/test';

// Revisions 1: the record report, opened from a table row, the status and the dashboard.
const PICKUP = 'PU-902'; // one malfunction in progress in the seed

test('a fuel row opens its report with the fuel details; Back closes it', async ({ page }) => {
  await page.goto(`/vehicles/${PICKUP}?panel=fuel`);
  const row = page.getByTestId('record-table').locator('tbody tr').first();
  await row.locator('td').nth(2).click();
  const report = page.getByTestId('record-report');
  await expect(report.locator('[data-kind="fuel"]')).toBeVisible();
  await expect(page).toHaveURL(/record=fuel\./);
  for (const field of ['fuelType', 'place', 'fueledBy', 'provider'])
    await expect(report.locator(`[data-field="${field}"]`)).toBeVisible();
  await expect(report.getByTestId('report-history')).toBeVisible();

  await page.goBack();
  await expect(report).toHaveCount(0);
  await expect(page.getByTestId('records-fuel')).toBeVisible();
});

test('the open-malfunction chip opens the only open malfunction; the edge resizes the report', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/vehicles/${PICKUP}`);
  await page.getByTestId('open-issues').click();
  const report = page.getByTestId('record-report');
  await expect(report.locator('[data-kind="malfunctions"]')).toBeVisible();

  const dialog = report.getByRole('dialog');
  // Let the slide-in finish, so the edge is where it will stay.
  await expect(dialog).toHaveCSS('transform', 'none');
  const before = (await dialog.boundingBox())!.width;
  const edge = (await report.getByTestId('sheet-resize').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x - 200, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(before + 150);

  await report.getByTestId('sheet-size').click();
  await expect(report).toHaveAttribute('data-full', 'true');
  await page.keyboard.press('Escape');
  await expect(report).toHaveCount(0);
});

test('the dashboard box lists open malfunctions and opens one on its vehicle page', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('kpi-malfunctions').click();
  const list = page.getByTestId('open-malfunctions');
  await expect(list.locator('li')).toHaveCount(5);
  await list.locator('li', { hasText: PICKUP }).getByRole('button').click();
  await expect(page).toHaveURL(new RegExp(`/vehicles/${PICKUP}\\?record=malfunctions\\.`));
  await expect(
    page.getByTestId('record-report').locator('[data-kind="malfunctions"]'),
  ).toBeVisible();
});

test('a malfunction report takes progress updates', async ({ page }) => {
  await page.goto(`/vehicles/${PICKUP}`);
  await page.getByTestId('open-issues').click();
  const log = page.getByTestId('progress-log');
  await expect(log).toBeVisible();
  const before = await log.locator('[data-progress]').count();
  await log.getByRole('textbox', { name: 'Add an update' }).fill('E2E checked the wiring');
  await log.getByRole('button', { name: 'Add update' }).click();
  await expect(log.locator('[data-progress]')).toHaveCount(before + 1);
  await expect(log).toContainText('E2E checked the wiring');
  await log
    .locator('[data-progress]', { hasText: 'E2E checked the wiring' })
    .getByRole('button', { name: 'Remove update' })
    .click();
  await expect(log.locator('[data-progress]')).toHaveCount(before);
});

test('contracted work lists only contracted work cards', async ({ page }) => {
  await page.goto('/vehicles/EX-102?panel=contracted');
  const panel = page.getByTestId('records-workCards');
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId('record-table').locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text).toContain('Contracted');
  // The fixed filter isn't offered as a choice.
  await expect(panel.getByLabel('In-house or contracted')).toHaveCount(0);
});

test('table columns resize by dragging the header edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vehicles/EX-102?panel=service');
  await page.evaluate(() => localStorage.removeItem('fh.colWidths.service'));
  await page.reload();
  const th = page.getByTestId('record-table').locator('thead th').nth(2);
  const before = (await th.boundingBox())!.width;
  const edge = (await th.getByTestId('col-resize').boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + 120, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await th.boundingBox())!.width).toBeGreaterThan(before + 80);
  await page.reload();
  expect((await th.boundingBox())!.width).toBeGreaterThan(before + 80);
  await page.evaluate(() => localStorage.removeItem('fh.colWidths.service'));
});

test('the vehicle report opens with the chosen sections', async ({ page, context }) => {
  await page.goto('/vehicles/EX-102');
  await page.getByTestId('vehicle-report-button').click();
  const dialog = page.getByTestId('vreport-dialog');
  await dialog.getByRole('button', { name: 'None' }).click();
  await dialog.locator('[data-part="workCards"]').check();
  await dialog.locator('[data-part="costs"]').check();
  const [report] = await Promise.all([
    context.waitForEvent('page'),
    page.getByTestId('open-vreport').click(),
  ]);
  await expect(report).toHaveURL(/\/vehicles\/EX-102\/report\?.*parts=workCards%2Ccosts/);
  const doc = report.getByTestId('vehicle-report');
  await expect(doc).toContainText('Work cards');
  await expect(doc.getByTestId('vreport-costs')).toBeVisible();
  await expect(doc).not.toContainText('Fuel economy');
});

test('editors change an excavator tool and Activity logs it', async ({ page }) => {
  await page.goto('/vehicles/EX-103');
  const picker = page.getByTestId('tool-picker');
  await picker.selectOption('ripper');
  await expect(page.getByText('Tool changed: Bucket → Ripper').first()).toBeVisible();
  await picker.selectOption('bucket');
  await expect(picker).toHaveValue('bucket');
});

test('admins add an extra field to location changes; it shows in the form and report', async ({
  page,
}) => {
  const clear = async () => {
    const settings = await (await page.request.get('/api/settings/app')).json();
    await page.request.put('/api/settings/app', {
      data: { ...settings, movementFields: [] },
      headers: { origin: 'http://localhost:5173' },
    });
  };
  await clear();
  await page.goto('/settings/required');
  const box = page.getByTestId('movement-fields');
  await box.getByRole('button', { name: 'Add a field' }).click();
  await box.getByLabel('Name in English').fill('Permit no.');
  await box.getByLabel('Name in Hebrew').fill('מספר היתר');
  await box.getByTestId('save-extra').click();
  await expect(box).toContainText('Saved.');

  await page.goto('/vehicles/EX-101?panel=movements');
  await page.getByTestId('add-record').click();
  const form = page.locator('#record-form');
  await form.getByRole('combobox', { name: 'To', exact: true }).selectOption({ index: 2 });
  await form.getByLabel('Transport contractor').fill('E2E Haulage');
  await form.getByLabel('Permit no.').fill('P-123');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  const row = page.getByTestId('record-table').locator('tbody tr', { hasText: 'E2E Haulage' });
  await row.locator('td').nth(2).click();
  const report = page.getByTestId('record-report');
  await expect(report.locator('[data-field="custom.c1"]')).toContainText('P-123');
  await expect(report.locator('[data-field="contractor"]')).toContainText('E2E Haulage');

  // Leave the settings as the seed has them.
  await clear();
});
