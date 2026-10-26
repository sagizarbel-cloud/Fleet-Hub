import { expect, test, type Page } from '@playwright/test';

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('dashboard', () => {
  test('shows KPIs, the timeline and the fleet grid side by side, mirrored in Hebrew', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('kpi-status')).toBeVisible();
    await expect(page.locator('[data-tile]').first()).toBeVisible();
    await expect(page.locator('[data-event-id]').first()).toBeVisible();
    expect((await box(page, 'timeline')).x).toBeLessThan((await box(page, 'fleet-grid')).x);

    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect((await box(page, 'timeline')).x).toBeGreaterThan((await box(page, 'fleet-grid')).x);
    await expect(page.getByRole('heading', { name: 'פעילות אחרונה' })).toBeVisible();
    await page.getByTestId('language-toggle').click();
  });

  test('filters the timeline by event type', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Fuel', exact: true }).click();
    const rows = page.locator('[data-event-id]');
    await expect(rows.first()).toContainText('Refueled');
    for (const text of await rows.allInnerTexts()) expect(text).toContain('Refueled');
  });

  test('filters the grid by status', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-tile]').first()).toBeVisible();
    const all = await page.locator('[data-tile]').count();
    await page.getByTestId('fleet-grid').getByRole('button', { name: 'Inoperable' }).click();
    await expect(page.locator('[data-tile]')).not.toHaveCount(all);
    const red = await page.locator('[data-tile]').count();
    expect(red).toBeGreaterThan(0);
    expect(red).toBeLessThan(all);
  });

  test('hovering an event links it to its tile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('[data-event-id]').first().hover();
    await expect(page.getByTestId('link-line')).toBeVisible();
  });
});

test.describe('selection transition', () => {
  test('opens a vehicle from its tile within 1.2 s, and Esc plays it back', async ({ page }) => {
    await page.goto('/');
    const tile = page.locator('[data-tile]').nth(3);
    const serial = (await tile.getAttribute('data-tile'))!;
    // Measured in the page: from the stage appearing until every (finite) animation on it is done.
    // The dev server adds render time before the stage mounts; the production build measures
    // about 1.15 s from click to settled.
    const settled = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let t0 = 0;
          const check = () => {
            const stage = document.querySelector('[data-testid=vehicle-stage]');
            if (stage && !t0) t0 = performance.now();
            const running = stage
              ?.getAnimations({ subtree: true })
              .filter(
                (a) => a.effect?.getTiming().iterations !== Infinity && a.playState !== 'finished',
              );
            const panels = stage ? [...stage.querySelectorAll<HTMLElement>('[data-panel]')] : [];
            const done =
              stage?.querySelector('[data-pose=side]') &&
              panels.length > 0 &&
              panels.every((el) => getComputedStyle(el).opacity === '1') &&
              running?.length === 0;
            if (done) resolve(performance.now() - t0);
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
    );
    await tile.click();
    await expect(page).toHaveURL(`/vehicles/${serial}`);
    const stage = page.getByTestId('vehicle-stage');
    expect(await settled).toBeLessThanOrEqual(1100);
    await expect(stage).toContainText(serial);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/');
    await expect(stage).toHaveCount(0);
    await expect(page.locator(`[data-tile="${serial}"]`)).toBeFocused();
  });

  test('deep links to a vehicle, and Back returns to the dashboard', async ({ page }) => {
    await page.goto('/vehicles/EX-101');
    const stage = page.getByTestId('vehicle-stage');
    await expect(stage).toContainText('EX-101');
    await stage.getByRole('button', { name: 'Back to the dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(stage).toHaveCount(0);
  });

  test('browser Back reverses the transition', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tile]').first().click();
    await expect(page.getByTestId('vehicle-stage')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
  });

  test('can be interrupted halfway', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-tile]').first().click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
    await expect(page.locator('[data-tile]').first()).toBeVisible();
  });

  test('opening from an event highlights it in the activity list', async ({ page }) => {
    await page.goto('/');
    const event = page.locator('[data-event-id]').first();
    const id = (await event.getAttribute('data-event-id'))!;
    await event.click();
    await expect(page).toHaveURL(new RegExp(`event=${id}`));
    await expect(
      page.getByTestId('vehicle-stage').locator(`aside [data-event-id="${id}"]`),
    ).toBeVisible();
  });

  test('shows a plain crossfade with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-tile]').first().click();
    await expect(page.getByTestId('vehicle-stage').locator('[data-pose=side]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
  });

  test('swiping toward the inline end goes back on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/vehicles/EX-101');
    const stage = page.getByTestId('vehicle-stage');
    await expect(stage).toBeVisible();
    await stage.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      clientX: 60,
      clientY: 500,
      isPrimary: true,
    });
    await stage.dispatchEvent('pointerup', {
      pointerType: 'touch',
      clientX: 260,
      clientY: 510,
      isPrimary: true,
    });
    await expect(page).toHaveURL('/');
  });
});

test('phone layout stacks KPIs, then the grid, then the timeline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-tile]').first()).toBeVisible();
  const kpi = await box(page, 'kpi-status');
  const grid = await box(page, 'fleet-grid');
  const timeline = await box(page, 'timeline');
  expect(kpi.y).toBeLessThan(grid.y);
  expect(grid.y).toBeLessThan(timeline.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
