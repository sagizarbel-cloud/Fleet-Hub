import { z } from 'zod';

/**
 * Movable, resizable panels (Sagi, 2026-11-22). Each user's arrangement is saved with their
 * preferences, with Reset to default. Only the dashboard has panels so far.
 */
export const DASHBOARD_PANELS = ['kpi', 'fuel', 'timeline', 'grid'] as const;
export type DashboardPanel = (typeof DASHBOARD_PANELS)[number];

/** Panels that scroll inside and so can be made taller or shorter. */
export const RESIZABLE_PANELS: readonly DashboardPanel[] = ['fuel', 'timeline'];
/** "To a certain degree": the limits of a panel's height (px) and the start column's width. */
export const PANEL_HEIGHT = { min: 180, max: 1400 } as const;
export const SPLIT = { min: 0.28, max: 0.62 } as const;

export interface DashboardLayout {
  /** Two columns on wide screens. */
  start: DashboardPanel[];
  end: DashboardPanel[];
  /** One column on phones and narrow windows. */
  phone: DashboardPanel[];
  /** The start column's share of the width. */
  split: number;
  /** Heights of resizable panels in px; missing = natural height. */
  heights: Partial<Record<DashboardPanel, number>>;
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  start: ['kpi', 'fuel', 'timeline'],
  end: ['grid'],
  phone: ['kpi', 'fuel', 'grid', 'timeline'],
  split: 0.4,
  heights: {},
};

const panel = z.enum(DASHBOARD_PANELS);
const panels = z.array(panel).max(DASHBOARD_PANELS.length);

export const dashboardLayoutSchema = z
  .object({
    start: panels,
    end: panels,
    phone: panels,
    split: z.number().min(SPLIT.min).max(SPLIT.max),
    heights: z.partialRecord(panel, z.number().int().min(PANEL_HEIGHT.min).max(PANEL_HEIGHT.max)),
  })
  // Every panel exactly once in the columns, and once in the phone list.
  .refine((l) => sameSet([...l.start, ...l.end]) && sameSet(l.phone), 'panels');

function sameSet(list: readonly string[]) {
  return (
    list.length === DASHBOARD_PANELS.length &&
    new Set(list).size === list.length &&
    DASHBOARD_PANELS.every((p) => list.includes(p))
  );
}

export const layoutsSchema = z.object({ dashboard: dashboardLayoutSchema.optional() });
export type Layouts = z.infer<typeof layoutsSchema>;

/** A saved layout, or the default when there is none or it no longer fits the panels. */
export function dashboardLayoutOf(saved: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(saved);
  return parsed.success ? parsed.data : DEFAULT_DASHBOARD_LAYOUT;
}
