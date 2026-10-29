import { expect, test, type Page } from '@playwright/test';

// Translation and right-to-left sweep (Phase 8, SPEC A8): every page and the main dialogs in
// Hebrew, at desktop and phone width. It fails on English words outside the allowed list, raw
// translation keys, sideways scrolling, and content that spills out of a side sheet.

/** Words that stay as written in Hebrew: names, brands and models from the seed, units, formats. */
const ALLOWED = new Set(
  [
    'Fleet Hub',
    'English',
    // Brands and models in the fake fleet
    'Caterpillar Komatsu Volvo Bobcat Toyota Mitsubishi Ford Humbaur Atlas Copco Mercedes-Benz',
    'John Deere Hilux Triton Transit Actros EW160 PC210 S650 FH 8FD25 XAS HS',
    // Units, file types and keys
    'MB KB kVA OBD J1939 PDF Excel JPEG PNG WebP SVG PIN VIN xlsx Shift AdBlue',
  ]
    .join(' ')
    .split(/\s+/),
);

/** Text on screen that would need translating: English words not in the list, raw i18n keys. */
function problems() {
  const out: string[] = [];
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden';
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement!;
    // Codes are isolated left to right on purpose; the language button names the other language;
    // text people typed (isolated in <bdi> or with dir=auto) stays as they wrote it.
    if (el.closest('[dir=ltr], [dir=auto], bdi, code, script, style, [lang=en]') || !shown(el))
      continue;
    // Typed text inside a translated sentence is wrapped in isolates (lib/bidi.ts).
    const text = (n.textContent ?? '').replace(/\u2068[^\u2069]*\u2069/g, '');
    for (const word of text.match(/[A-Za-z][A-Za-z0-9-]+/g) ?? []) out.push(`word: ${word}`);
    if (/\b[a-z]+\.[a-z]+[A-Za-z]*\.[A-Za-z.]+\b/.test(text)) out.push(`key: ${text.trim()}`);
  }
  for (const el of document.querySelectorAll('[aria-label], [placeholder], [title]'))
    for (const a of ['aria-label', 'placeholder', 'title'])
      // A tooltip repeating the cell's own (typed) text was checked with the text.
      if (!(a === 'title' && el.getAttribute(a) === el.textContent))
        for (const word of el
          .getAttribute(a)
          ?.replace(/\u2068[^\u2069]*\u2069/g, '')
          .match(/[A-Za-z][A-Za-z0-9-]+/g) ?? [])
          out.push(`word: ${word} (${a})`);
  if (document.documentElement.scrollWidth > innerWidth + 1)
    out.push(`sideways scroll: ${document.documentElement.scrollWidth}px wide`);
  for (const sheet of document.querySelectorAll('[data-testid=sheet]')) {
    const box = sheet.getBoundingClientRect();
    for (const el of sheet.querySelectorAll('table, dl, form'))
      if (el.getBoundingClientRect().left < box.left - 1)
        out.push(`spills out of the sheet: ${el.tagName.toLowerCase()}`);
  }
  return out;
}

async function check(page: Page, where: string) {
  await page.waitForTimeout(400);
  const found = (await page.evaluate(problems)).filter((p) => {
    const word = /^word: (\S+)/.exec(p)?.[1];
    // A code written into a label (EX-101, GP-1200) is a serial or model, not a word.
    return !word || !(ALLOWED.has(word) || /\d/.test(word) || /^[A-Z]{2,}-?$/.test(word));
  });
  expect([...new Set(found)], where).toEqual([]);
}

const PAGES: [string, string][] = [
  ['/', 'fleet-grid'],
  ['/fleet', 'fleet-table'],
  ['/receipts', 'receipts-view'],
  ['/quotes', 'quotes-view'],
  ['/equipment', 'item-table'],
  ['/settings', 'theme-toggle'],
  ['/settings/lists', 'lookup-table'],
  ['/settings/users', 'users'],
  ['/settings/import', 'import-drop'],
  ['/vehicles/EX-101', 'vitals'],
  ...[
    'service',
    'malfunctions',
    'fluids',
    'fuel',
    'movements',
    'inspections',
    'ownership',
    'documents',
    'quotes',
    'notes',
  ].map((p): [string, string] => [`/vehicles/EX-101?panel=${p}`, 'record-panel']),
];

test.describe.configure({ mode: 'serial' });
test.afterAll(async ({ request }) => {
  await request.put('/api/me/preferences', { data: { language: 'en' } });
});

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`Hebrew on ${name}`, () => {
    test.use({ viewport, reducedMotion: 'reduce' });
    test.beforeEach(async ({ page }) => {
      await page.request.put('/api/me/preferences', { data: { language: 'he' } });
    });

    test('every page is in Hebrew and fits', async ({ page }) => {
      test.setTimeout(120_000);
      for (const [path, ready] of PAGES) {
        await page.goto(path);
        await page.getByTestId(ready).first().waitFor();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await check(page, path);
      }
    });

    test('dialogs and forms are in Hebrew and fit', async ({ page }) => {
      test.setTimeout(120_000);
      const sheet = page.getByTestId('sheet');
      await page.goto('/');
      await page.getByTestId('add-vehicle').click();
      await page.getByTestId('type-picker').locator('button, label').nth(2).click();
      await page.getByTestId('vehicle-next').click();
      await page.getByTestId('vehicle-next').click(); // empty: shows the field errors
      await check(page, 'add vehicle, identity step');

      await page.goto('/vehicles/EX-101?panel=fuel');
      await page.getByTestId('add-record').click();
      await sheet.locator('button[type=submit]').click();
      await check(page, 'add fill-up with errors');

      await page.goto('/quotes');
      await page.getByTestId('quote-row').first().click();
      await sheet.waitFor();
      await check(page, 'quote');

      await page.goto('/equipment');
      await page.getByTestId('item-row').first().click();
      await sheet.waitFor();
      await check(page, 'item');

      await page.goto('/fleet');
      await page.getByTestId('views-menu').click();
      await check(page, 'saved views');
    });
  });
}

test('shekel amounts read number first in Hebrew', async ({ page }) => {
  await page.request.put('/api/me/preferences', { data: { language: 'he' } });
  await page.goto('/');
  const spend = page.getByTestId('kpi-spend').locator('bdi');
  // In right-to-left text the sign follows the number, so it sits to its left on screen.
  const box = await spend.evaluate((el) => {
    const range = document.createRange();
    const text = el.firstChild!;
    const s = text.textContent!;
    const at = (i: number) => {
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      return range.getBoundingClientRect().left;
    };
    return { sign: at(s.indexOf('₪')), digit: at(s.search(/\d/)) };
  });
  expect(box.sign).toBeLessThan(box.digit);
});
