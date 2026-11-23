import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { hasRole, PERMISSION_FIELDS, RECORD_KINDS, type RecordKind } from '@fleet-hub/shared';
import { useCan } from '@/auth/can';
import { SETTINGS_PATHS } from '@/settings/paths';
import { useAppSettings } from '@/vehicle/records/api';
import { AREA_ROUTES, AREAS } from './nav';

/** A page, an action or a field found without asking the server (Sagi, 2026-11-23). */
export interface LocalHit {
  group: 'page' | 'action' | 'field';
  key: string;
  label: string;
  /** Where it sits, e.g. "Settings" or the card's name. */
  where?: string;
  /** A path to open, or the action to run. */
  to: string | (() => void);
}

/** Every word of the query, in any order, in either language's text. */
const matches = (q: string, ...texts: (string | undefined)[]) => {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

/**
 * Pages, actions and field names that match the query, in English or Hebrew whatever the
 * language on screen. Each user sees only what their role may open.
 */
export function useLocalHits(q: string, actions: { addVehicle?: () => void }): LocalHit[] {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const { data: settings } = useAppSettings();
  return useMemo(() => {
    if (q.length < 2 || !can.role) return [];
    const role = can.role;
    const en = i18n.getFixedT('en');
    const he = i18n.getFixedT('he');
    const both = (key: string): string[] => [String(en(key as never)), String(he(key as never))];
    const out: LocalHit[] = [];
    const add = (hit: LocalHit, ...texts: string[]) => {
      if (matches(q, hit.label, ...texts)) out.push(hit);
    };

    // Pages: the main areas and the settings sections this role may open.
    for (const a of AREAS)
      add(
        { group: 'page', key: `area-${a}`, label: t(`nav.${a}`), to: AREA_ROUTES[a].path },
        ...both(`nav.${a}`),
      );
    for (const [s, { path, role: min }] of Object.entries(SETTINGS_PATHS)) {
      if (s === 'mine' || !hasRole(role, min)) continue;
      add(
        {
          group: 'page',
          key: `settings-${s}`,
          label: t(`settings.section.${s as 'lists'}`),
          where: t('nav.settings'),
          to: path,
        },
        ...both(`settings.section.${s}`),
        ...both('nav.settings'),
      );
    }

    // Actions.
    if (actions.addVehicle && can.card('vehicle'))
      add(
        {
          group: 'action',
          key: 'add-vehicle',
          label: t('vehicleForm.addTitle'),
          to: actions.addVehicle,
        },
        ...both('vehicleForm.addTitle'),
        ...both('topbar.add'),
      );
    const go = (key: string, label: string, to: string, min: 'EDITOR' | 'ADMIN' | 'VIEWER') => {
      if (hasRole(role, min))
        add({ group: 'action', key, label: t(label as never), to }, ...both(label));
    };
    go('import', 'search.action.import', SETTINGS_PATHS.import.path, 'ADMIN');
    go('add-user', 'search.action.addUser', SETTINGS_PATHS.users.path, 'ADMIN');
    go('export', 'search.action.exportFleet', AREA_ROUTES.fleetTable.path, 'VIEWER');
    go('add-receipt', 'search.action.addReceipt', AREA_ROUTES.receipts.path, 'VIEWER');
    go('add-quote', 'search.action.addQuote', AREA_ROUTES.quotes.path, 'VIEWER');
    go('add-item', 'search.action.addItem', AREA_ROUTES.equipment.path, 'EDITOR');
    go('add-field', 'search.action.addField', SETTINGS_PATHS.required.path, 'ADMIN');
    go('permissions', 'search.action.permissions', SETTINGS_PATHS.permissions.path, 'ADMIN');

    // Fields: the cards, their extra fields and the vehicle's own fields, for admins, who are
    // the ones who change them.
    if (can.isAdmin) {
      const card = (k: RecordKind) => t(`vehicle.records.${k as 'notes'}`);
      const cardPath = (k: RecordKind) => `${SETTINGS_PATHS.required.path}?card=${k}`;
      for (const k of RECORD_KINDS) {
        add(
          { group: 'field', key: `card-${k}`, label: card(k), to: cardPath(k) },
          ...both(`vehicle.records.${k}`),
        );
        for (const f of settings?.recordFields[k] ?? [])
          add(
            {
              group: 'field',
              key: `extra-${k}-${f.key}`,
              label: i18n.language === 'he' ? f.labelHe : f.labelEn,
              where: card(k),
              to: cardPath(k),
            },
            f.labelEn,
            f.labelHe,
            ...(f.options ?? []).flatMap((o) => [o.labelEn, o.labelHe]),
          );
      }
      for (const f of PERMISSION_FIELDS)
        add(
          {
            group: 'field',
            key: `vehicle-${f}`,
            label: t(`vehicleForm.field.${f}`),
            where: t('permissions.card.vehicle'),
            to: SETTINGS_PATHS.permissions.path,
          },
          ...both(`vehicleForm.field.${f}`),
        );
    }
    return out.slice(0, 12);
  }, [q, can, settings, t, i18n, actions.addVehicle]);
}
