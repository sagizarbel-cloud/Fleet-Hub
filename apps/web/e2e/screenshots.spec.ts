import { test } from '@playwright/test';
import { SIGNED_OUT } from './helpers';

// Saves the Phase 1 screenshots for the PR: login + dashboard, EN and HE, desktop and phone.
const OUT = '../../docs/screenshots/phase-1';
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to refresh docs/screenshots');

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  for (const lang of ['en', 'he'] as const) {
    test(`${lang} ${sizeName}`, async ({ browser }) => {
      for (const [name, state, path] of [
        ['login', SIGNED_OUT, '/login'],
        ['dashboard', undefined, '/'],
      ] as const) {
        const context = await browser.newContext({
          viewport,
          ...(state ? { storageState: state } : {}),
        });
        await context.addInitScript((l) => localStorage.setItem('fh.lang', l), lang);
        const page = await context.newPage();
        await page.goto(path);
        await page.waitForSelector(name === 'login' ? '#login-title' : '#area-title');
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${name}-${lang}-${sizeName}.png` });
        await context.close();
      }
    });
  }
}
