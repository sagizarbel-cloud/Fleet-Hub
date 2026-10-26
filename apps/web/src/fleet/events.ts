import type { TFunction } from 'i18next';
import {
  ArrowLeftRight,
  CircleDot,
  ClipboardCheck,
  Droplet,
  FilePlus2,
  Fuel,
  Package,
  ReceiptText,
  StickyNote,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { EventType } from '@fleet-hub/shared';
import { lookupName, type FleetEvent, type Lookups } from './data';

/** Timeline filter chips. Each chip covers related event types. */
export const EVENT_GROUPS = {
  status: {
    icon: CircleDot,
    types: ['VEHICLE_CREATED', 'VEHICLE_UPDATED', 'STATUS_CHANGED', 'STATUS_OVERRIDDEN'],
  },
  service: { icon: Wrench, types: ['SERVICE'] },
  malfunctions: {
    icon: TriangleAlert,
    types: ['MALFUNCTION_REPORTED', 'MALFUNCTION_UPDATED', 'MALFUNCTION_RESOLVED'],
  },
  fluids: { icon: Droplet, types: ['FLUID_ADDED'] },
  fuel: { icon: Fuel, types: ['FUEL_ADDED'] },
  movements: { icon: ArrowLeftRight, types: ['MOVEMENT'] },
  inspections: { icon: ClipboardCheck, types: ['INSPECTION'] },
  items: { icon: Package, types: ['ITEM_ASSIGNED', 'ITEM_REMOVED'] },
  documents: { icon: ReceiptText, types: ['DOCUMENT_ADDED', 'QUOTE_LINKED'] },
  notes: { icon: StickyNote, types: ['NOTE_ADDED'] },
} satisfies Record<string, { icon: LucideIcon; types: EventType[] }>;
export type EventGroup = keyof typeof EVENT_GROUPS;
export const EVENT_GROUP_KEYS = Object.keys(EVENT_GROUPS) as EventGroup[];

const GROUP_OF = Object.fromEntries(
  EVENT_GROUP_KEYS.flatMap((g) => EVENT_GROUPS[g].types.map((type) => [type, g])),
) as Record<EventType, EventGroup>;

export const EVENT_ICON = Object.fromEntries(
  Object.entries(GROUP_OF).map(([type, g]) => [
    type,
    type === 'QUOTE_LINKED' ? FilePlus2 : EVENT_GROUPS[g].icon,
  ]),
) as Record<EventType, LucideIcon>;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function formatMoney(amount: number, lang: string) {
  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** The event's one-line description, built from translated templates at render time. */
export function describeEvent(
  t: TFunction,
  e: FleetEvent,
  lookups: Lookups | undefined,
  lang: string,
): string {
  const p = e.params;
  const lookup = (list: keyof Lookups, code: unknown) =>
    lookupName(
      lookups?.[list].find((i) => i.code === code),
      lang,
    ) ?? str(code);
  const status = (v: unknown) =>
    v === 'GREEN' || v === 'AMBER' || v === 'RED' ? t(`status.${v}`) : '';

  switch (e.type) {
    case 'STATUS_CHANGED':
    case 'STATUS_OVERRIDDEN':
      return t(`events.${e.type}`, { to: status(p.to) });
    case 'SERVICE':
    case 'MALFUNCTION_UPDATED':
    case 'MALFUNCTION_RESOLVED':
      return t(`events.${e.type}`, { description: str(p.description) });
    case 'MALFUNCTION_REPORTED': {
      const sev = str(p.severity);
      const severity =
        sev === 'LOW' || sev === 'MEDIUM' || sev === 'HIGH' || sev === 'CRITICAL'
          ? t(`severity.${sev}`)
          : '';
      return t('events.MALFUNCTION_REPORTED', { severity, description: str(p.description) });
    }
    case 'FLUID_ADDED':
      return t('events.FLUID_ADDED', {
        liters: num(p.liters),
        fluid: lookup('fluidTypes', p.fluid),
      });
    case 'FUEL_ADDED':
      return t('events.FUEL_ADDED', { liters: num(p.liters) });
    case 'MOVEMENT':
      return t('events.MOVEMENT', {
        from: lookup('locations', p.from),
        to: lookup('locations', p.to),
      });
    case 'INSPECTION': {
      const kind = str(p.kind);
      return t('events.INSPECTION', {
        kind:
          kind === 'ANNUAL_TEST' || kind === 'INSURANCE' || kind === 'SAFETY_CHECK'
            ? t(`inspection.${kind}`)
            : '',
      });
    }
    case 'ITEM_ASSIGNED':
    case 'ITEM_REMOVED':
      return t(`events.${e.type}`, { item: str(p.item) });
    case 'DOCUMENT_ADDED':
      return t('events.DOCUMENT_ADDED', {
        category: lookup('receiptCategories', p.category),
        amount: formatMoney(num(p.amount), lang),
      });
    case 'QUOTE_LINKED':
      return t('events.QUOTE_LINKED', { supplier: str(p.supplier) });
    case 'VEHICLE_CREATED':
    case 'VEHICLE_UPDATED':
    case 'NOTE_ADDED':
      return t(`events.${e.type}`);
  }
}

/** Local calendar day key, e.g. "2026-10-26". */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
