import { expect, test, type Page } from '@playwright/test';

// Motion polish (Phase 8, SPEC 5.2): the vehicle really flies out of its tile, Back can cut in at
// any moment, double clicks don't stack, and reduced motion keeps everything still.

/** Records the drawing's transform on every frame until `ms` have passed. */
const recordHero = (page: Page, ms: number) =>
  page.evaluate(
    (until) =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = [];
        const t0 = performance.now();
        const frame = () => {
          const hero = document.querySelector<HTMLElement>('[data-hero]');
          if (hero) seen.push(hero.style.transform || 'none');
          if (performance.now() - t0 < until) requestAnimationFrame(frame);
          else resolve(seen);
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-tile]').first().waitFor();
});

test('the vehicle flies out of its tile and back into it', async ({ page }) => {
  const frames = recordHero(page, 1200);
  await page.locator('[data-tile]').nth(3).click();
  const moving = (await frames).filter((t) => t.includes('translate'));
  expect(moving.length, 'frames with the drawing between tile and stage').toBeGreaterThan(1);

  await page.waitForTimeout(600);
  const back = recordHero(page, 1500);
  await page.keyboard.press('Escape');
  expect((await back).some((t) => t.includes('translate'))).toBe(true);
  await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
});

test('Esc right after the click still goes back', async ({ page }) => {
  await page.locator('[data-tile]').nth(3).click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
});

test('Back mid-flight heads home at once', async ({ page }) => {
  await page.locator('[data-tile]').nth(3).click();
  await page.getByTestId('vehicle-stage').waitFor();
  await page.waitForTimeout(150);
  const started = Date.now();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
  // Fly home (~0.45 s) plus the dev server's slack; it used to hang in the air first.
  expect(Date.now() - started).toBeLessThan(1500);
});

test('a double click opens the vehicle once, so Back leaves it', async ({ page }) => {
  await page.locator('[data-tile]').nth(3).dblclick();
  await page.getByTestId('vehicle-stage').waitFor();
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('vehicle-stage')).toHaveCount(0);
});

test('quick Next presses land on the right vehicle and Back still returns', async ({ page }) => {
  await page.locator('[data-tile]').first().click();
  const stage = page.getByTestId('vehicle-stage');
  await stage.waitFor();
  const first = (await stage.getAttribute('data-serial'))!;
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(stage).not.toHaveAttribute('data-serial', first);
  await expect(page.getByTestId('vehicle-nav')).toContainText(/(^|\D)4\/\d+/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
});

test('reduced motion: nothing moves, panels only fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const frames = recordHero(page, 1000);
  await page.locator('[data-tile]').nth(3).click();
  expect((await frames).filter((t) => t.includes('translate'))).toEqual([]);
  const moved = await page
    .getByTestId('vehicle-stage')
    .locator('[data-panel]')
    .evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).transform).filter((t) => t !== 'none'),
    );
  expect(moved).toEqual([]);
});

test('switching language crossfades without a reload', async ({ page }) => {
  const marker = await page.evaluate(() => ((window as { fhMark?: number }).fhMark = Date.now()));
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PUT',
  );
  await page.getByTestId('language-toggle').click();
  await saved;
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => (window as { fhMark?: number }).fhMark)).toBe(marker);
  // Back to English for the other tests (the language is saved to the shared account).
  const again = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PUT',
  );
  await page.getByTestId('language-toggle').click();
  await again;
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
