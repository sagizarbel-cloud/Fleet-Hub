import { expect, test, type Locator, type Page } from '@playwright/test';

// Sagi's list of 2026-11-22: search any field, resolve a malfunction with the worker named,
// and panels each user can arrange on the dashboard and the vehicle page.
const ORIGIN = { origin: 'http://localhost:5173' };

const order = (page: Page | Locator, list: string) =>
  page
    .locator(`[data-list-root="${list}"] > [data-panel-frame]`)
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.panelFrame));

test.describe('top bar search', () => {
  test('finds a vehicle by serial and opens it with Enter', async ({ page }) => {
    await page.goto('/');
    const input = page.getByTestId('search-input');
    await input.fill('ex-101');
    const results = page.getByTestId('search-results');
    await expect(results.getByTestId('search-hit').first()).toContainText('EX-101');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/vehicles\/EX-101/);
    await expect(input).toHaveValue('');
  });

  test('finds text inside records, with the vehicle serial on the hit', async ({ page }) => {
    await page.goto('/');
    // A seeded malfunction description ("cracked mirror").
    await page.getByTestId('search-input').fill('מראה סדוקה');
    const hit = page.getByTestId('search-hit').first();
    await expect(hit).toBeVisible();
    await expect(hit.locator('bdi[dir=ltr]')).toHaveText(/^[A-Z]{2}-\d{3}$/);
  });
});

test.describe('malfunctions', () => {
  test('an editor marks one resolved from its report, naming who fixed it', async ({ page }) => {
    const url = '/api/vehicles/TK-802/records/malfunctions';
    const reportedAt = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await page.request.post(url, {
      headers: ORIGIN,
      data: { reportedAt, severity: 'LOW', state: 'OPEN', description: 'E2E loose mirror' },
    });
    expect(res.ok()).toBeTruthy();
    const id = (await res.json()).item.id as string;

    await page.goto(`/vehicles/TK-802?record=malfunctions.${id}`);
    await expect(page.getByTestId('open-for')).toContainText('3 days');
    const form = page.getByTestId('progress-form');
    await form.locator('textarea').fill('Mirror tightened');
    await form.getByTestId('progress-author-input').fill('Fake mechanic');
    await form.getByTestId('progress-resolve').check();
    await form.getByTestId('progress-save').click();
    await expect(page.getByTestId('progress-author').first()).toHaveText('Fake mechanic');
    await expect(page.getByTestId('open-for')).toContainText('Was open');
    await expect(page.getByTestId('report-resolve')).toHaveCount(0);

    await page.request.delete(`${url}/${id}`, { headers: ORIGIN });
  });
});

test.describe('arranging panels', () => {
  test.afterEach(async ({ page }) => {
    await page.request.put('/api/me/preferences', { headers: ORIGIN, data: { layouts: null } });
  });

  test('the dashboard keeps a moved panel after reload, and resets', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => order(page, 'start')).toEqual(['kpi', 'fuel', 'timeline']);
    await page.getByTestId('layout-arrange').click();
    await page.getByTestId('down-kpi').click();
    await expect.poll(() => order(page, 'start')).toEqual(['fuel', 'kpi', 'timeline']);
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PUT',
    );
    await page.getByTestId('swap-timeline').click();
    await expect.poll(() => order(page, 'end')).toEqual(['grid', 'timeline']);
    expect((await saved).ok()).toBeTruthy();

    await page.reload();
    await expect.poll(() => order(page, 'start')).toEqual(['fuel', 'kpi']);
    await expect.poll(() => order(page, 'end')).toEqual(['grid', 'timeline']);

    await page.getByTestId('layout-arrange').click();
    const height = page.getByTestId('height-fuel');
    await height.focus();
    await height.press('ArrowDown');
    await expect(page.locator('[data-panel-frame=fuel]')).toHaveAttribute('data-sized', '');

    await page.getByTestId('layout-reset').click();
    await expect.poll(() => order(page, 'start')).toEqual(['kpi', 'fuel', 'timeline']);
    await expect(page.locator('[data-panel-frame=fuel]')).not.toHaveAttribute('data-sized');
  });

  test('a panel on the vehicle page moves by dragging its handle', async ({ page }) => {
    await page.goto('/vehicles/EX-101');
    const stage = page.getByTestId('vehicle-stage');
    await expect(stage.getByTestId('record-cards')).toBeVisible();
    await stage.getByTestId('layout-arrange').click();
    // Drag Assigned items onto the top half of Records, just above it.
    const records = stage.locator('[data-panel-frame=records]');
    await records.scrollIntoViewIfNeeded();
    const target = (await records.boundingBox())!;
    const handle = (await stage.getByTestId('drag-items').boundingBox())!;
    await page.mouse.move(handle.x + 10, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 40, target.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => order(stage, 'start')).toEqual(['items', 'records']);
    await expect.poll(() => order(stage, 'end')).toEqual(['activity']);
  });
});
