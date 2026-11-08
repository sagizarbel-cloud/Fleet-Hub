import { expect, test, type Page } from '@playwright/test';

/**
 * Drawing review (Sagi, 2026-11-08): parts must not end up hidden behind their neighbours. Each
 * drawing on the hidden /drawings page is re-painted with one flat colour per part, and the share
 * of each part that stays in sight is compared with the floor below.
 */

type View = 'top' | 'iso' | 'side';
type Floors = Partial<Record<View, Record<string, number>>>;

/**
 * How much of each part must show, per type and view (0..1): a few points under what the reviewed
 * drawings show, so a part slipping behind another fails (the forklift's mast drawn behind its
 * body showed 78%, against 100% now). Measured on the drawings rendered from the 3D models.
 */
const FLOORS: Record<string, Floors> = {
  wheel_loader: {
    iso: { cab: 0.82, boom: 0.65, bucket: 0.95 },
    side: { cab: 0.9, boom: 0.42, bucket: 0.95 },
    // From above, the 3D bucket and cab roof cover the ends of the arms.
    top: { boom: 0.62, cab: 0.95 },
  },
  forklift: { iso: { mast: 0.95, cab: 0.9 }, side: { mast: 0.95 } },
  truck: { iso: { cab: 0.85, bed: 0.68 }, side: { cab: 0.92, bed: 0.92 } },
  tractor: { iso: { cab: 0.66 }, side: { cab: 0.62 } },
  // The cab is on the operator's left, so the boom, tank and steps stand in front of it (Sagi,
  // 2026-11-08).
  tracked_excavator: { iso: { cab: 0.35, boom: 0.92, bucket: 0.7 }, side: { cab: 0.35 } },
  wheeled_excavator: { iso: { cab: 0.35, boom: 0.9, bucket: 0.66 }, side: { cab: 0.35 } },
  // The traced cab is taller than the bed, so it hides the bed's front wall in the iso view.
  pickup: { iso: { cab: 0.87, bed: 0.6 } },
  skid_steer: { iso: { cab: 0.72, bucket: 0.9 } },
};

/** The share of each part's painted area that is still on top once every part is painted. */
async function visibility(page: Page, type: string, view: View) {
  const card = page.getByTestId(`drawing-${type}`);
  const svgs = card.locator('svg');
  // The card's first row is the app's drawing: three top views, two isometric, one side.
  const svg = svgs.nth(view === 'top' ? 0 : view === 'iso' ? 3 : 5);
  return svg.evaluate(async (el: SVGSVGElement) => {
    const groups = [...el.querySelectorAll<SVGGElement>('g[data-part]')];
    const parts = [...new Set(groups.map((g) => g.dataset.part!))];
    const colour = (i: number) => `rgb(${(i + 1) * 20}, 0, 0)`;
    const paint = async (only?: string) => {
      const clone = el.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll('.vd-ground').forEach((n) => n.remove());
      clone.querySelectorAll<SVGGElement>('g[data-part]').forEach((g) => {
        const part = g.dataset.part!;
        if (only && part !== only) g.remove();
        else
          g.querySelectorAll<SVGElement>('*').forEach((n) => {
            n.setAttribute('style', `fill:${colour(parts.indexOf(part))};stroke:none;opacity:1`);
          });
      });
      const box = el.viewBox.baseVal;
      const w = 400;
      const h = Math.round((w * box.height) / box.width);
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(h));
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const counts = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 250 || data[i + 1]! > 0) continue;
        const part = parts[Math.round(data[i]! / 20) - 1];
        if (part && Math.abs(data[i]! - (parts.indexOf(part) + 1) * 20) < 3)
          counts.set(part, (counts.get(part) ?? 0) + 1);
      }
      return counts;
    };
    const all = await paint();
    const shown: Record<string, number> = {};
    for (const part of parts) {
      const alone = (await paint(part)).get(part) ?? 0;
      shown[part] = alone ? Math.min(1, (all.get(part) ?? 0) / alone) : 1;
    }
    return shown;
  });
}

test('every key part of every drawing stays in sight', async ({ page }) => {
  await page.goto('/drawings');
  await expect(page.getByTestId('drawing-wheel_loader')).toBeVisible();
  const problems: string[] = [];
  for (const [type, views] of Object.entries(FLOORS)) {
    for (const [view, floors] of Object.entries(views) as [View, Record<string, number>][]) {
      const shown = await visibility(page, type, view);
      for (const [part, floor] of Object.entries(floors)) {
        const share = shown[part];
        if (share === undefined) problems.push(`${type} ${view}: no ${part} drawn`);
        else if (share < floor)
          problems.push(
            `${type} ${view}: ${part} ${Math.round(share * 100)}% in sight, needs ${floor * 100}%`,
          );
      }
    }
  }
  expect(problems).toEqual([]);
});
