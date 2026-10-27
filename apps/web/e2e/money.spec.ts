import { expect, test, type Page } from '@playwright/test';
import { VIEWER_STATE } from './helpers';

// SPEC 5.5 receipts, 5.6 price quotes and the equipment catalog, against the seeded fleet.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const LOADER = 'WL-401';

async function pickVehicle(page: Page, serial: string) {
  const picker = page.getByTestId('vehicle-picker');
  if (!(await picker.getByTestId('picker-search').isVisible()))
    await picker.getByTestId('assign-vehicle').click();
  await picker.getByTestId('picker-search').fill(serial);
  await picker.getByTestId('picker-vehicle').first().click();
}

async function addReceipt(page: Page, vendor: string, amount: string) {
  await page.getByTestId('receipt-add').click();
  const sheet = page.getByTestId('sheet');
  await page.getByTestId('file-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await pickVehicle(page, LOADER);
  await sheet.getByTestId('receipt-vendor').fill(vendor);
  await sheet.getByTestId('receipt-amount').fill(amount);
  await sheet.getByTestId('receipt-category').selectOption({ index: 1 });
  await page.getByTestId('receipt-save').click();
  await expect(sheet).toBeHidden();
}

test.describe('receipts', () => {
  test('add a receipt with a photo, find it, delete it and Undo', async ({ page }) => {
    const vendor = `E2E Garage ${Date.now()}`;
    await page.goto('/receipts');
    await addReceipt(page, vendor, '312');

    await page.getByTestId('receipt-search').fill(vendor);
    const card = page.getByTestId('receipt-card').filter({ hasText: vendor });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(LOADER);
    await expect(page.getByTestId('receipt-sum')).toContainText('312');

    await card.getByTestId('receipt-delete').click();
    await expect(card).toHaveCount(0);
    await page.getByTestId('undo-bar').getByRole('button', { name: 'Undo' }).click();
    await expect(card).toHaveCount(1);
  });

  test('a file dropped on a dashboard tile opens a receipt for that vehicle', async ({ page }) => {
    await page.goto('/');
    const tile = page.locator(`[data-tile="${LOADER}"]`);
    await tile.evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'fuel.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(
        new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect(tile).toHaveAttribute('data-drop', 'file');
    await expect(page.getByText(`Drop to add a receipt for`)).toBeVisible();
    await tile.evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'fuel.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    });
    const sheet = page.getByTestId('sheet');
    await expect(sheet.getByRole('heading', { name: 'Add receipt' })).toBeVisible();
    await expect(sheet.getByText('fuel.pdf')).toBeVisible();
    await expect(sheet.getByTestId('vehicle-picker')).toContainText(LOADER);
    await expect(tile).not.toHaveAttribute('data-drop');
  });
});

test.describe('viewer suggestions', () => {
  test('a viewer suggests a receipt, an admin approves it', async ({ page, browser }) => {
    const vendor = `E2E Suggested ${Date.now()}`;
    const viewer = await browser.newContext({ storageState: VIEWER_STATE });
    const vp = await viewer.newPage();
    await vp.goto('/receipts');
    await vp.getByTestId('receipt-add').click();
    await expect(vp.getByTestId('receipt-save')).toHaveText('Send for approval');
    await vp.getByTestId('file-input').setInputFiles({
      name: 'receipt.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await pickVehicle(vp, LOADER);
    await vp.getByTestId('receipt-vendor').fill(vendor);
    await vp.getByTestId('receipt-amount').fill('99');
    await vp.getByTestId('receipt-save').click();
    await expect(vp.getByText('Sent for approval: 1')).toBeVisible();
    await vp.getByTestId('receipt-search').fill(vendor);
    const mine = vp.getByTestId('receipt-card').filter({ hasText: vendor });
    await expect(mine.getByTestId('suggested-badge')).toBeVisible();
    await expect(mine.getByTestId('receipt-approve')).toHaveCount(0);
    await viewer.close();

    await page.goto('/receipts');
    await page.getByTestId('receipt-search').fill(vendor);
    const card = page.getByTestId('receipt-card').filter({ hasText: vendor });
    await expect(card.getByTestId('suggested-badge')).toBeVisible();
    await card.getByTestId('receipt-approve').click();
    await expect(card.getByTestId('suggested-badge')).toHaveCount(0);
  });
});

test.describe('price quotes', () => {
  async function addQuote(page: Page, supplier: string, partNo: string, price: string) {
    await page.getByTestId('quote-add').click();
    const sheet = page.getByTestId('sheet');
    await sheet.getByTestId('quote-supplier').fill(supplier);
    const line = sheet.getByTestId('quote-line').first();
    await line.getByTestId('line-item').fill('E2E hydraulic pump');
    await line.getByTestId('line-partno').fill(partNo);
    await line.getByTestId('line-qty').fill('2');
    await line.getByTestId('line-price').fill(price);
    await expect(sheet.getByTestId('quote-form-total')).toContainText(
      (Number(price) * 2).toLocaleString('en'),
    );
    await pickVehicle(page, LOADER);
    await page.getByTestId('quote-save').click();
    // A new quote opens on its own page.
    await expect(page.getByTestId('quote-detail')).toBeVisible();
    await expect(sheet).toContainText(supplier);
    await page.getByTestId('sheet').getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  }

  test('two suppliers quote one part, and the comparison marks the cheaper', async ({ page }) => {
    const stamp = Date.now();
    const partNo = `E2E-${stamp}`;
    await page.goto('/quotes');
    await addQuote(page, `E2E Hydraulics A ${stamp}`, partNo, '1200');
    await addQuote(page, `E2E Hydraulics B ${stamp}`, partNo, '950');

    await page.getByTestId('quote-search').fill(String(stamp));
    await expect(page.getByTestId('quote-row')).toHaveCount(2);

    await page.getByTestId('quote-compare').click();
    const select = page.getByTestId('compare-part');
    const option = select.locator('option', { hasText: partNo });
    await select.selectOption(await option.getAttribute('value'));
    const lines = page.getByTestId('compare-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.filter({ hasText: 'Cheapest' })).toContainText(`B ${stamp}`);
    await page.keyboard.press('Escape');

    // Picking both rows compares the whole quotes side by side.
    for (const box of await page.getByTestId('quote-pick').all()) await box.check();
    await page.getByTestId('quote-compare').click();
    await expect(page.getByTestId('compare-quotes')).toContainText(`A ${stamp}`);
  });

  test('status moves along the flow, and admins set who sees a quote', async ({ page }) => {
    const supplier = `E2E Status ${Date.now()}`;
    await page.goto('/quotes');
    await addQuote(page, supplier, `E2E-S-${Date.now()}`, '100');
    await page.getByTestId('quote-search').fill(supplier);
    await page.getByTestId('quote-open').first().click();
    const detail = page.getByTestId('quote-detail');
    await detail.getByTestId('quote-to-RECEIVED').click();
    await expect(detail.getByTestId('quote-to-APPROVED')).toBeVisible();
    await detail.getByTestId('quote-visibility').selectOption('PUBLIC');
    await expect(detail.getByTestId('visibility-badge')).toHaveText('Public');
  });
});

test.describe('quotes as a viewer', () => {
  test.use({ storageState: VIEWER_STATE });

  test('sees public quotes and their own, never admins-only ones', async ({ page }) => {
    await page.goto('/quotes');
    await expect(page.getByTestId('quote-row').first()).toBeVisible();
    await expect(page.getByTestId('quote-list').getByText('Admins only')).toHaveCount(0);

    // A public quote from someone else opens read-only, with no visibility control.
    const row = page
      .getByTestId('quote-row')
      .filter({ has: page.getByTestId('visibility-badge').getByText('Public') })
      .first();
    await row.getByTestId('quote-open').click();
    const detail = page.getByTestId('quote-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId('quote-visibility')).toHaveCount(0);
  });
});

test.describe('equipment', () => {
  // Tall enough that the tray and the tiles share the screen: a drag can't scroll the page.
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('drag an item from the dashboard tray onto a vehicle', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tray-toggle').click();
    const item = page.getByTestId('tray-item').first();
    await expect(item).toBeVisible();
    const name = (await item.locator('span').first().textContent())!;
    const from = (await item.locator('bdi').count())
      ? await item.locator('bdi').textContent()
      : null;
    const target = from === LOADER ? 'WL-402' : LOADER;

    await item.dragTo(page.locator(`[data-tile="${target}"]`));
    const bar = page.getByTestId('tray-bar');
    await expect(bar).toContainText(name);
    await bar.getByTestId('tray-confirm').click();
    await expect(bar).toContainText(`${name} assigned to`);
    await expect(
      page.getByTestId('tray-item').filter({ hasText: name }).first().locator('bdi'),
    ).toHaveText(target);
  });

  test('the catalog page assigns an item and sends it back to the yard', async ({ page }) => {
    await page.goto('/equipment');
    await page.getByTestId('item-row').first().click();
    const sheet = page.getByTestId('item-detail');
    await sheet.getByTestId('item-target').selectOption({ index: 1 });
    await sheet.getByTestId('item-assign').click();
    await expect(sheet.getByTestId('item-remove')).toBeVisible();
    await sheet.getByTestId('item-remove').click();
    await expect(sheet.getByTestId('item-remove')).toHaveCount(0);
  });
});
