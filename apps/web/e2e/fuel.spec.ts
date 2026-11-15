import { expect, test } from '@playwright/test';
import { toggleLanguage } from './helpers';

/** Current fuel (Sagi, 2026-11-15): the panel, a manual level, and a live reading arriving. */
test.describe('current fuel', () => {
  test('lists the fleet lowest first, trailers left out, and the live link comes up', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('fuel-panel');
    await expect(panel.getByRole('heading', { name: 'Current fuel' })).toBeVisible();
    await expect(panel.getByTestId('fuel-link')).toHaveAttribute('data-state', 'open');
    const rows = panel.locator('[data-serial]');
    await expect(rows.first()).toBeVisible();
    const serials = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-serial')));
    expect(serials).not.toContain('TL-971');
    const levels = await panel
      .getByRole('meter')
      .evaluateAll((els) =>
        els.map((e) => Number(e.getAttribute('aria-valuenow') ?? 'NaN')).filter((n) => !isNaN(n)),
      );
    expect(levels).toEqual([...levels].sort((a, b) => a - b));

    await toggleLanguage(page);
    await expect(panel.getByRole('heading', { name: 'מפלס דלק נוכחי' })).toBeVisible();
    await toggleLanguage(page);
  });

  test('an editor sets a level by hand; it shows as manual and in the timeline', async ({
    page,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('fuel-panel');
    await panel.getByRole('button', { name: 'Set the fuel level of TK-802' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('spinbutton', { name: /Level/ }).fill('37');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toBeHidden();
    const row = panel.locator('[data-serial="TK-802"]');
    await expect(row).toHaveAttribute('data-state', 'manual');
    await expect(row.getByRole('meter')).toHaveAttribute('aria-valuenow', '37');
    await expect(page.locator('[data-event-id]').first()).toContainText('Fuel level set to 37%');
  });

  test('a reading posted with a connection token reaches the open panel without a reload', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const panel = page.getByTestId('fuel-panel');
    await expect(panel.getByTestId('fuel-link')).toHaveAttribute('data-state', 'open');

    const made = await page.evaluate(async () => {
      const res = await fetch('/api/telematics/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'e2e tracker', serial: 'WL-402' }),
      });
      return (await res.json()) as { token: string; connection: { id: string } };
    });
    const res = await request.post('/api/telematics/v1/readings', {
      headers: { authorization: `Bearer ${made.token}` },
      data: { fuelLevelPct: 12 },
    });
    expect(await res.json()).toEqual({ accepted: 1, ignored: [] });

    const row = panel.locator('[data-serial="WL-402"]');
    await expect(row).toHaveAttribute('data-state', 'live');
    await expect(row.getByRole('meter')).toHaveAttribute('aria-valuenow', '12');

    // Turn it off again so reruns start clean.
    await page.evaluate(
      (id) => fetch(`/api/telematics/connections/${id}`, { method: 'DELETE' }),
      made.connection.id,
    );
  });
});
