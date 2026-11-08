import { useMemo } from 'react';
import {
  wiggleItems,
  type AppSettings,
  type RecordKind,
  type WiggleProfile,
} from '@fleet-hub/shared';
import { useAppSettings } from './api';
import { customColumns, KIND_UI, type Column } from './kinds';

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
  const defs = kind === 'movements' ? (settings?.movementFields ?? []) : [];
  if (!defs.length) return base;
  const notes = base.findIndex((c) => c.key === 'notes');
  const at = notes < 0 ? base.length : notes;
  return [...base.slice(0, at), ...customColumns(defs), ...base.slice(at)];
}

export function useKindColumns(kind: RecordKind, profile?: WiggleProfile | null) {
  const { data } = useAppSettings();
  return useMemo(() => kindColumns(kind, data, profile), [kind, data, profile]);
}
