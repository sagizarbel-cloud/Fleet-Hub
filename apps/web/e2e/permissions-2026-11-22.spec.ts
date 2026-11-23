import { expect, test } from '@playwright/test';
import { VIEWER_STATE } from './helpers';

// Sagi's second list of 2026-11-22: due frames, the service type, an admin's own fields on any
// card, who may edit what (with its history), and the fluids column in the fleet table.
const ORIGIN = { origin: 'http://localhost:5173' };

test.describe('due frames', () => {
  test('a service due soon has an orange frame, an overdue test a full red one', async ({
    page,
  }) => {
    await page.goto('/vehicles/TK-802');
    await expect(page.locator('[data-due="overdue"]').first()).toBeVisible();
    await page.goto('/vehicles/EX-102');
    await expect(page.locator('[data-due]').first()).toBeVisible();
  });
});

test.describe('service type', () => {
  test('the service form starts with the service type list', async ({ page }) => {
    await page.goto('/vehicles/EX-101');
    await page.locator('[data-record="service"]').click();
    await page.getByTestId('add-record').click();
    const type = page.getByLabel('Service type');
    await expect(type).toBeVisible();
    await expect(type.locator('option')).toContainText(['General service', 'Electrical service']);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('an admin opens the card’s fields from the vehicle page', async ({ page }) => {
    await page.goto('/vehicles/EX-101');
    await page.locator('[data-record="service"]').click();
    await page.getByTestId('manage-fields').click();
    const fields = page.getByTestId('card-fields-service');
    await expect(fields.locator('[data-extra="c1"] input').first()).toHaveValue('Service type');
  });
});

test.describe('permissions', () => {
  test('an admin limits a card to admins, it shows in the history, and a viewer loses it', async ({
    page,
    browser,
  }) => {
    const before = await (await page.request.get('/api/settings/app')).json();
    try {
      await page.goto('/settings/permissions');
      const notes = page.getByTestId('perm-card-notes');
      await notes.selectOption('ADMIN');
      await expect(page.getByTestId('permission-history').locator('li').first()).toContainText(
        'Notes',
      );

      const viewer = await browser.newContext({ storageState: VIEWER_STATE });
      const vp = await viewer.newPage();
      await vp.goto('/vehicles/EX-101');
      await vp.locator('[data-record="notes"]').click();
      await expect(vp.getByTestId('record-panel')).toBeVisible();
      await expect(vp.getByTestId('add-record')).toHaveCount(0);
      await viewer.close();
    } finally {
      const now = await (await page.request.get('/api/settings/app')).json();
      await page.request.put('/api/settings/app', {
        headers: ORIGIN,
        data: { ...now, permissions: before.permissions },
      });
    }
  });
});

test.describe('fleet table', () => {
  test('the usage group offers the fluids columns', async ({ page }) => {
    await page.goto('/fleet');
    await page.getByTestId('group-usage').click();
    await expect(page.getByRole('checkbox', { name: 'Last fluid added' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Fluids added, 12 months (L)' })).toBeVisible();
  });
});
