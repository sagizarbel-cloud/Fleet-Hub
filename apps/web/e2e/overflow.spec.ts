import { expect, test, type Page } from '@playwright/test';

/**
 * Yard signage rule (Sagi, 2026-11-05): no text spills out of its box. On each main screen, in
 * English and Hebrew, at desktop and phone widths, the page never scrolls sideways and no box
 * holds text wider than itself unless it clips it on purpose (ellipsis or a scroller).
 */
const SCREENS = [
  '/',
  '/vehicles/EX-102',
  '/fleet',
  '/receipts',
  '/quotes',
  '/equipment',
  '/settings',
];
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

async function spills(page: Page) {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('header *, main *')) {
      const style = getComputedStyle(el);
      if (style.display === 'inline' || style.display === 'contents' || style.display === 'none')
        continue;
      if (style.overflowX !== 'visible' || el.clientWidth === 0) continue;
      if (el.closest('svg, [data-overflow-ok]')) continue;
      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
      );
      if (!hasText) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        found.push(
          `${el.tagName.toLowerCase()}.${el.className}: "${el.textContent!.trim().slice(0, 40)}"`,
        );
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1)
      found.push('page scrolls sideways');
    return found;
  });
}

for (const lang of ['en', 'he'] as const) {
  for (const size of WIDTHS) {
    test(`no text leaves its box: ${lang} at ${size.width}px`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: 'test-results/.auth/admin.json',
        viewport: size,
      });
      await context.addInitScript((l) => {
        localStorage.setItem('fh.lang', l);
        localStorage.setItem('fh.design', 'yard');
      }, lang);
      const page = await context.newPage();
      // The account's saved language wins over the device's, so set it there and put it back.
      const prefs = (body: object) =>
        page.request.put('/api/me/preferences', {
          data: body,
          headers: { origin: new URL(page.url() || 'http://localhost:5173').origin },
        });
      await page.goto('/');
      await prefs({ language: lang, design: 'yard' });
      const problems: string[] = [];
      for (const path of SCREENS) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        problems.push(...(await spills(page)).map((p) => `${path} ${p}`));
      }
      await prefs({ language: 'en', design: null });
      await context.close();
      expect(problems).toEqual([]);
    });
  }
}
