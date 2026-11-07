import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Yard play is an optional install: these run only when the build has it (YARD_PLAY=on). */
function built() {
  if (process.env.YARD_PLAY) return process.env.YARD_PLAY === 'on';
  try {
    return /^YARD_PLAY=on\s*$/m.test(readFileSync('../../.env', 'utf8'));
  } catch {
    return false;
  }
}

test.describe('yard play', () => {
  test.skip(!built(), 'the build has no Yard play (YARD_PLAY is off)');

  test('starts from the easter egg, throws and drives vehicles, writes nothing, and Esc ends it', async ({
    page,
  }) => {
    await page.goto('/');
    const origin = { origin: new URL(page.url()).origin };
    const before = await (await page.request.get('/api/settings/app')).json();
    const set = (yardPlay: boolean) =>
      page.request.put('/api/settings/app', { data: { ...before, yardPlay }, headers: origin });
    expect((await set(true)).ok()).toBe(true);
    try {
      await page.reload();
      await expect(page.locator('[data-tile]').first()).toBeVisible();

      const writes: string[] = [];
      page.on('request', (r) => r.method() !== 'GET' && writes.push(`${r.method()} ${r.url()}`));

      // Five quick taps on the Fleet heading open it.
      const title = page.locator('#fleet-title');
      for (let i = 0; i < 5; i++) await title.click();
      await expect(page.getByTestId('yard-play')).toBeVisible();
      await expect(page.getByTestId('fleet-grid')).toHaveAttribute('data-playing', '');

      // A tap on a vehicle takes its wheel; the arrows drive it instead of scrolling the page.
      const scrolled = await page.evaluate(() => scrollY);
      const driven = (await page.locator('[data-tile-visual]').nth(1).boundingBox())!;
      await page.mouse.click(driven.x + driven.width / 2, driven.y + driven.height / 2);
      await expect(page.getByTestId('yard-play')).toContainText('Driving');
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(600);
      await page.keyboard.up('ArrowUp');
      expect(await page.evaluate(() => scrollY)).toBe(scrolled);

      // A drag throws another one.
      const box = (await page.locator('[data-tile-visual]').first().boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 40, y + i * 20);
      await page.mouse.up();
      await page.waitForTimeout(500);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('yard-play')).toHaveCount(0);
      await expect(page.locator('[data-tile]').first()).toBeVisible();

      // Typing "yard" outside a field opens it too; Exit closes it.
      await page.keyboard.type('yard');
      await expect(page.getByTestId('yard-play')).toBeVisible();
      await page.getByTestId('yard-play-exit').click();
      await expect(page.getByTestId('yard-play')).toHaveCount(0);

      expect(writes).toEqual([]);
    } finally {
      await set(before.yardPlay ?? false);
    }
  });

  test('stays hidden while the admin switch is off', async ({ page }) => {
    await page.goto('/');
    const origin = { origin: new URL(page.url()).origin };
    const before = await (await page.request.get('/api/settings/app')).json();
    await page.request.put('/api/settings/app', {
      data: { ...before, yardPlay: false },
      headers: origin,
    });
    try {
      await page.reload();
      await expect(page.locator('[data-tile]').first()).toBeVisible();
      await page.keyboard.type('yard');
      await page.waitForTimeout(300);
      await expect(page.getByTestId('yard-play')).toHaveCount(0);
    } finally {
      await page.request.put('/api/settings/app', { data: before, headers: origin });
    }
  });
});
