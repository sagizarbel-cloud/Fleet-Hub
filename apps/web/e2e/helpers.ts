export const ADMIN = {
  email: 'admin@fleethub.test',
  password: process.env.SEED_PASSWORD ?? 'fleethub-dev',
};
export const STORAGE_STATE = 'test-results/.auth/admin.json';
export const SIGNED_OUT = { cookies: [], origins: [] };
export const VIEWER = { email: 'viewer@fleethub.test', password: ADMIN.password };
export const VIEWER_STATE = 'test-results/.auth/viewer.json';

/** Switches the language as a user does, and waits until the account has saved it. */
export async function toggleLanguage(page: import('@playwright/test').Page) {
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/me/preferences') && r.request().method() === 'PUT',
  );
  await page.getByTestId('language-toggle').click();
  await saved;
}
