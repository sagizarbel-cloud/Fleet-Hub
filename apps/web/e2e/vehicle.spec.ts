import { expect, test, type Page } from '@playwright/test';
import { VIEWER_STATE, toggleLanguage } from './helpers';

// SPEC 5.3 and A7 against the seeded fleet: PU-901 is a pickup with a start code.
const PICKUP = 'PU-901';
const DEFAULTS = ['status', 'usage', 'nextService', 'annualTest', 'location', 'department'];

async function openVehicle(page: Page, serial = PICKUP) {
  await page.goto(`/vehicles/${serial}`);
  await expect(page.getByTestId('vitals').locator('[data-vital]').first()).not.toHaveText('…');
}

test.describe('vehicle page', () => {
  test('shows Serial, VIN and License, and copies one on click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openVehicle(page);
    const vin = page.locator('[data-copy]').nth(1);
    const value = await vin.getAttribute('data-copy');
    await vin.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(1);
  });

  test('reveals the start code only on request, for a permitted user', async ({ page }) => {
    await openVehicle(page);
    const code = page.getByTestId('start-code-value');
    await expect(code).toHaveText('••••');
    const reveal = page.waitForResponse((r) => r.url().includes('/start-code/reveal'));
    await page.getByTestId('start-code').getByRole('button', { name: 'Reveal' }).click();
    expect((await reveal).status()).toBe(200);
    await expect(code).toHaveText(/^\d{4}$/);
    await page.getByTestId('start-code').getByRole('button', { name: 'Hide' }).click();
    await expect(code).toHaveText('••••');
  });

  test('pinned vitals can be changed and are kept after a reload', async ({ page }) => {
    // Start from the defaults, whatever an earlier run left.
    await page.request.put('/api/me/preferences', {
      headers: { origin: 'http://localhost:5173' },
      data: { pinnedVitals: DEFAULTS },
    });
    await openVehicle(page);
    const vitals = page.getByTestId('vitals').locator('[data-vital]');
    await expect(vitals).toHaveCount(6);
    await page.getByRole('button', { name: 'Customize vitals' }).click();
    await page.getByRole('checkbox', { name: 'Fuel economy, last 30 days' }).click();
    await page.getByRole('checkbox', { name: 'Department' }).click();
    await expect(vitals).toHaveCount(6);
    await expect(vitals.last()).toHaveAttribute('data-vital', 'fuelEconomy');
    await page.reload();
    await expect(page.locator('[data-vital=fuelEconomy]')).toBeVisible();
    await expect(page.locator('[data-vital=department]')).toHaveCount(0);
    // Leave the seeded account as it was.
    await page.getByRole('button', { name: 'Customize vitals' }).click();
    await page.getByRole('button', { name: 'Back to the defaults' }).click();
    await expect(page.locator('[data-vital=department]')).toBeVisible();
  });

  test('the side view has four callouts', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openVehicle(page);
    await page.getByRole('button', { name: 'Side view' }).click();
    const callouts = page.getByTestId('callouts').locator('[data-callout]');
    await expect(callouts).toHaveCount(4);
    await expect(callouts.first()).toBeVisible();
  });

  test('a record card opens its panel, and Back closes it', async ({ page }) => {
    await openVehicle(page);
    await page.locator('[data-record=fuel]').click();
    const panel = page.getByTestId('record-panel');
    await expect(panel).toHaveAttribute('data-panel-key', 'fuel');
    await expect(page).toHaveURL(/panel=fuel/);
    await page.goBack();
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/vehicles/${PICKUP}$`));
    // Esc closes a panel without leaving the vehicle.
    await page.locator('[data-record=notes]').click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('vehicle-stage')).toBeVisible();
  });

  test('Prev / Next and the arrow keys move between vehicles in grid order, mirrored in Hebrew', async ({
    page,
  }) => {
    await openVehicle(page);
    const stage = page.getByTestId('vehicle-stage');
    await page.getByRole('button', { name: 'Next vehicle' }).click();
    await expect(stage).toHaveAttribute('data-serial', 'PU-902');
    await page.keyboard.press('ArrowLeft');
    await expect(stage).toHaveAttribute('data-serial', PICKUP);

    // The language follows the account, so switch it the way a user does, and back after.
    await toggleLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowLeft');
    await expect(stage).toHaveAttribute('data-serial', 'PU-902');
    await toggleLanguage(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('jump to a vehicle by its plate or serial', async ({ page }) => {
    await openVehicle(page);
    await page.getByRole('button', { name: 'Jump to vehicle' }).click();
    await page.getByRole('searchbox', { name: 'Jump to vehicle' }).fill('EX-101');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vehicle-stage')).toHaveAttribute('data-serial', 'EX-101');
  });

  test('a linked event older than the first page is found and highlighted', async ({
    page,
    request,
  }) => {
    // The seed has under 60 events per vehicle, so shrink the activity pages to 10.
    await page.route(/\/api\/events\?.*vehicle=/, (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '10');
      return route.continue({ url: url.toString() });
    });
    const res = await request.get(`/api/events?vehicle=${PICKUP}&limit=200`);
    const items = (await res.json()).items as { id: string }[];
    expect(items.length).toBeGreaterThan(25);
    const old = items[items.length - 1]!;
    await page.goto(`/vehicles/${PICKUP}?event=${old.id}`);
    const row = page.locator(`aside [data-event-id="${old.id}"]`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toBeInViewport();
  });
});

test.describe('as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('sees the masked start code with no Reveal, and no item editing', async ({ page }) => {
    await openVehicle(page);
    await expect(page.getByTestId('start-code-value')).toHaveText('••••');
    await expect(page.getByTestId('start-code').getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('items').getByRole('button', { name: 'Assign' })).toHaveCount(0);
    const direct = await page.request.post(`/api/vehicles/${PICKUP}/start-code/reveal`, {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(direct.status()).toBe(403);
  });
});
