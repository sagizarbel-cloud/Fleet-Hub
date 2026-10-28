import { isolate } from '@/lib/bidi';
import type { TFunction } from 'i18next';
import {
  ArrowLeftRight,
  CircleDot,
  ClipboardCheck,
  Droplet,
  FileMinus2,
  FilePlus2,
  Fuel,
  Package,
  Pencil,
  Trash2,
  Undo2,
  ReceiptText,
  StickyNote,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { RECORD_KINDS, VEHICLE_FIELDS, type EventType, type VehicleField } from '@fleet-hub/shared';
import { lookupName, type FleetEvent, type Lookups } from './data';
import { numberFormat } from '@/lib/intl';

/** Timeline filter chips. Each chip covers related event types. */
export const EVENT_GROUPS = {
  status: {
    icon: CircleDot,
    types: [
      'VEHICLE_CREATED',
      'VEHICLE_UPDATED',
      'STATUS_CHANGED',
      'STATUS_OVERRIDDEN',
      'RECORD_EDITED',
      'RECORD_DELETED',
      'RECORD_RESTORED',
    ],
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
  documents: { icon: ReceiptText, types: ['DOCUMENT_ADDED', 'QUOTE_LINKED', 'QUOTE_UNLINKED'] },
  notes: { icon: StickyNote, types: ['NOTE_ADDED'] },
} satisfies Record<string, { icon: LucideIcon; types: EventType[] }>;
export type EventGroup = keyof typeof EVENT_GROUPS;
export const EVENT_GROUP_KEYS = Object.keys(EVENT_GROUPS) as EventGroup[];

const GROUP_OF = Object.fromEntries(
  EVENT_GROUP_KEYS.flatMap((g) => EVENT_GROUPS[g].types.map((type) => [type, g])),
) as Record<EventType, EventGroup>;

const OWN_ICON: Partial<Record<EventType, LucideIcon>> = {
  QUOTE_LINKED: FilePlus2,
  QUOTE_UNLINKED: FileMinus2,
  RECORD_EDITED: Pencil,
  RECORD_DELETED: Trash2,
  RECORD_RESTORED: Undo2,
};

export const EVENT_ICON = Object.fromEntries(
  Object.entries(GROUP_OF).map(([type, g]) => [
    type,
    OWN_ICON[type as EventType] ?? EVENT_GROUPS[g].icon,
  ]),
) as Record<EventType, LucideIcon>;

// Vehicle fields an update event can name; the ownership panel also changes the supplier.
type NamedField = VehicleField | 'supplier';
const NAMED_FIELDS = new Set<NamedField>([...VEHICLE_FIELDS, 'supplier']);

/** Event types whose description is just their name, with nothing about the record itself. */
const PLAIN = new Set<EventType>(['NOTE_ADDED', 'VEHICLE_CREATED']);

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function formatMoney(amount: number, lang: string) {
  return numberFormat(lang === 'he' ? 'he-IL' : 'en-IL', {
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
      return t('events.STATUS_CHANGED', { to: status(p.to) });
    case 'STATUS_OVERRIDDEN':
      return p.cleared
        ? t('events.STATUS_OVERRIDE_CLEARED', { to: status(p.to) })
        : str(p.reason)
          ? t('events.STATUS_OVERRIDDEN_REASON', {
              to: status(p.to),
              reason: isolate(str(p.reason)),
            })
          : t('events.STATUS_OVERRIDDEN', { to: status(p.to) });
    case 'RECORD_EDITED':
    case 'RECORD_DELETED':
    case 'RECORD_RESTORED': {
      // "Edited: Refueled 60 L", built from the record's own event template.
      const of = str(p.of) as EventType;
      const kind = RECORD_KINDS.find((k) => k === p.kind);
      // A record whose own entry has no details (a note) reads "Note deleted", not "Note deleted:
      // Note added".
      const detail =
        of && of !== e.type && !PLAIN.has(of)
          ? describeEvent(t, { ...e, type: of }, lookups, lang)
          : '';
      return t(detail ? `events.${e.type}` : `events.${e.type}_plain`, {
        record: kind
          ? t(`vehicle.records.one.${kind}`)
          : p.kind === 'receipt'
            ? t('receipts.one')
            : '',
        detail,
      });
    }
    case 'SERVICE':
    case 'MALFUNCTION_UPDATED':
    case 'MALFUNCTION_RESOLVED':
      return t(`events.${e.type}`, { description: isolate(str(p.description)) });
    case 'MALFUNCTION_REPORTED': {
      const sev = str(p.severity);
      const severity =
        sev === 'LOW' || sev === 'MEDIUM' || sev === 'HIGH' || sev === 'CRITICAL'
          ? t(`severity.${sev}`)
          : '';
      return t('events.MALFUNCTION_REPORTED', {
        severity,
        description: isolate(str(p.description)),
      });
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
      return t(`events.${e.type}`, { item: isolate(str(p.item)) });
    case 'DOCUMENT_ADDED': {
      // Category and amount are both optional on a receipt.
      const details = [
        p.category ? lookup('receiptCategories', p.category) : null,
        p.amount === null || p.amount === undefined ? null : formatMoney(num(p.amount), lang),
      ].filter(Boolean);
      return details.length
        ? t('events.DOCUMENT_ADDED', { details: details.join(', ') })
        : t('events.DOCUMENT_ADDED_bare');
    }
    case 'QUOTE_LINKED':
    case 'QUOTE_UNLINKED':
      return t(`events.${e.type}`, { supplier: isolate(str(p.supplier)) });
    case 'VEHICLE_UPDATED': {
      // "Vehicle details updated: model, odometer", from the names of the changed fields.
      const fields = (Array.isArray(p.fields) ? p.fields : []).filter((f): f is NamedField =>
        NAMED_FIELDS.has(f as NamedField),
      );
      if (!fields.length) return t('events.VEHICLE_UPDATED');
      const names = fields.map((f) => t(`vehicleForm.field.${f}`));
      return t('events.VEHICLE_UPDATED_fields', {
        fields: new Intl.ListFormat(lang === 'he' ? 'he' : 'en', { type: 'conjunction' }).format(
          names,
        ),
      });
    }
    case 'VEHICLE_CREATED':
    case 'NOTE_ADDED':
      return t(`events.${e.type}`);
  }
}

/** Local calendar day key, e.g. "2026-10-26". */
export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
