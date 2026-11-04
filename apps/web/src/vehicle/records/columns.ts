import { useMemo } from 'react';
import type { AppSettings, RecordKind } from '@fleet-hub/shared';
import { useAppSettings } from './api';
import { customColumns, KIND_UI, type Column } from './kinds';

/** A kind's columns plus the extra fields an admin defined for it (Revisions 1), before notes. */
export function kindColumns(kind: RecordKind, settings: AppSettings | undefined): Column[] {
  const base = KIND_UI[kind].columns;
  const defs = kind === 'movements' ? (settings?.movementFields ?? []) : [];
  if (!defs.length) return base;
  const notes = base.findIndex((c) => c.key === 'notes');
  const at = notes < 0 ? base.length : notes;
  return [...base.slice(0, at), ...customColumns(defs), ...base.slice(at)];
}

export function useKindColumns(kind: RecordKind) {
  const { data } = useAppSettings();
  return useMemo(() => kindColumns(kind, data), [kind, data]);
}
