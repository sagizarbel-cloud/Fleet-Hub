import { z } from 'zod';

/**
 * Movable, resizable panels (Sagi, 2026-11-22) on the dashboard and the vehicle page. Each user's
 * arrangement is saved with their preferences, with Reset to default.
 */

/** "To a certain degree": the limits of a panel's height in px. */
export const PANEL_HEIGHT = { min: 180, max: 1400 } as const;

export interface PanelLayout<P extends string = string> {
  /** Two columns on wide screens. */
  start: P[];
  end: P[];
  /** One column on phones and narrow windows. */
  phone: P[];
  /** The start column's share of the width. */
  split: number;
  /** Heights of resizable panels in px; missing = natural height. */
  heights: Partial<Record<P, number>>;
}

export interface PanelScreen<P extends string> {
  panels: readonly P[];
  /** Panels that scroll inside and so can be made taller or shorter. */
  resizable: readonly P[];
  /** Limits of the start column's share of the width. */
  split: { min: number; max: number };
  defaults: PanelLayout<P>;
  schema: z.ZodType<PanelLayout<P>>;
  /** A saved layout, or the default when there is none or it no longer fits the panels. */
  of: (saved: unknown) => PanelLayout<P>;
}

function panelScreen<const P extends string>(
  panels: readonly [P, ...P[]],
  resizable: readonly P[],
  split: { min: number; max: number },
  defaults: PanelLayout<P>,
): PanelScreen<P> {
  const panel = z.enum(panels);
  const list = z.array(panel).max(panels.length);
  const sameSet = (l: readonly string[]) =>
    l.length === panels.length &&
    new Set(l).size === l.length &&
    panels.every((p) => l.includes(p));
  const schema = z
    .object({
      start: list,
      end: list,
      phone: list,
      split: z.number().min(split.min).max(split.max),
      heights: z.partialRecord(panel, z.number().int().min(PANEL_HEIGHT.min).max(PANEL_HEIGHT.max)),
    })
    // Every panel exactly once in the columns, and once in the phone list.
    .refine((l) => sameSet([...l.start, ...l.end]) && sameSet(l.phone), 'panels') as z.ZodType<
    PanelLayout<P>
  >;
  return {
    panels,
    resizable,
    split,
    defaults,
    schema,
    of: (saved) => {
      const parsed = schema.safeParse(saved);
      return parsed.success ? parsed.data : defaults;
    },
  };
}

export const DASHBOARD_SCREEN = panelScreen(
  ['kpi', 'fuel', 'timeline', 'grid'],
  ['fuel', 'timeline'],
  { min: 0.28, max: 0.62 },
  {
    start: ['kpi', 'fuel', 'timeline'],
    end: ['grid'],
    phone: ['kpi', 'fuel', 'grid', 'timeline'],
    split: 0.4,
    heights: {},
  },
);
export type DashboardPanel = (typeof DASHBOARD_SCREEN.panels)[number];

/** The vehicle page: the header and drawing stay on top; the panels below them move. */
export const VEHICLE_SCREEN = panelScreen(
  ['records', 'items', 'activity'],
  ['activity'],
  { min: 0.55, max: 0.8 },
  {
    start: ['records', 'items'],
    end: ['activity'],
    phone: ['records', 'items', 'activity'],
    split: 0.75,
    heights: {},
  },
);
export type VehiclePanel = (typeof VEHICLE_SCREEN.panels)[number];

export const layoutsSchema = z.object({
  dashboard: DASHBOARD_SCREEN.schema.optional(),
  vehicle: VEHICLE_SCREEN.schema.optional(),
});
export type Layouts = z.infer<typeof layoutsSchema>;
export type LayoutName = keyof Layouts;
