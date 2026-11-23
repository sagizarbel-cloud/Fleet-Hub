import { useMemo } from 'react';
import {
  wiggleItems,
  type AppSettings,
  type RecordKind,
  type WiggleProfile,
} from '@fleet-hub/shared';
import { useAppSettings } from './api';
import { createdByCol, customColumns, KIND_UI, updatedByCol, type Column } from './kinds';

/**
 * A kind's columns plus the extra fields an admin defined for it (Revisions 1), before notes.
 * Wiggle tests keep only the item columns of `profile`'s checklist, when one is given.
 */
export function kindColumns(
  kind: RecordKind,
  settings: AppSettings | undefined,
  profile?: WiggleProfile | null,
): Column[] {
  const all = KIND_UI[kind].columns;
  const items = profile ? new Set(wiggleItems(profile).map((i) => `results.${i}`)) : null;
  const base =
    kind === 'wiggleTests' && items
      ? all.filter((c) => !c.key.startsWith('results.') || items.has(c.key))
      : all;
  const defs = settings?.recordFields[kind] ?? [];
  // Who added it and who last changed it, on every card (Sagi, 2026-11-22).
  const people = [
    ...(base.some((c) => c.key === 'createdBy') ? [] : [{ ...createdByCol, minor: true }]),
    updatedByCol,
  ];
  // A header field (e.g. the service type) leads, right after the date. One an admin placed
  // after a field (Sagi, 2026-11-23) follows that field's column; the rest go before notes.
  const header = customColumns(defs.filter((f) => f.header));
  const notes = base.findIndex((c) => c.key === 'notes');
  const at = notes < 0 ? base.length : notes;
  const cols = [...base.slice(0, 1), ...header, ...base.slice(1, at)];
  const tail = base.slice(at);
  const left = defs.filter((f) => !f.header);
  // Placed ones may follow each other, so place until nothing moves.
  for (let moved = true; moved;) {
    moved = false;
    for (const f of [...left]) {
      const target = cols.findIndex((c) => c.key === f.after || c.key === `custom.${f.after}`);
      if (!f.after || target < 0) continue;
      cols.splice(target + 1, 0, ...customColumns([f]));
      left.splice(left.indexOf(f), 1);
      moved = true;
    }
  }
  return [...cols, ...customColumns(left), ...tail, ...people];
}

export function useKindColumns(kind: RecordKind, profile?: WiggleProfile | null) {
  const { data } = useAppSettings();
  return useMemo(() => kindColumns(kind, data, profile), [kind, data, profile]);
}
