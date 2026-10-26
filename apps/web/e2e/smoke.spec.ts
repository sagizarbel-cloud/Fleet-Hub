import { expect, test } from '@playwright/test';
import { ADMIN, SIGNED_OUT } from './helpers';

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('signs in, switches to Hebrew with RTL, and remembers it', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login/);
    await page.fill('input[name=email]', ADMIN.email);
    await page.fill('input[name=password]', ADMIN.password);
    await page.click('button[type=submit]');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByTestId('language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'לוח בקרה' })).toBeVisible();

    await page.getByRole('link', { name: 'הגדרות' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'הגדרות' })).toBeVisible();
  });

  test('rejects a wrong password with a translated message', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name=email]', 'viewer@fleethub.test');
    await page.fill('input[name=password]', 'wrong-password');
    await page.click('button[type=submit]');
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
  });
});

test('the hidden /i18n-check page reports no missing Hebrew keys', async ({ page }) => {
  await page.goto('/i18n-check');
  await expect(page.getByTestId('i18n-ok')).toBeVisible();
});

test('signing out returns to the login page', async ({ browser }) => {
  // Own sign-in so signing out doesn't end the shared session.
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('input[name=email]', 'editor@fleethub.test');
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test('on a phone the area tabs scroll, with a cue, and every area is reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const more = page.getByTestId('nav-more-end');
  await expect(more).toHaveCSS('opacity', '1');
  const settings = page.getByRole('link', { name: 'Settings' });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(settings).toBeInViewport();
  await expect(more).toHaveCSS('opacity', '0');
});
