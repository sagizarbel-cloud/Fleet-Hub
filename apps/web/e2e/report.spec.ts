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
