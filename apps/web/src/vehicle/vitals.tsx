import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dueByDate,
  dueByHours,
  FUEL_LOW_PCT,
  fuelState,
  worstDue,
  type DueLevel,
  type VitalKey,
} from '@fleet-hub/shared';
import { lookupName, useLookups } from '@/fleet/data';
import { formatMoney } from '@/fleet/events';
import { useDateFormat } from '@/fleet/FleetGrid';
import type { VehicleDetail } from './data';
import { fuelAmount, useFuelAge } from '@/fleet/fuel/format';
import { localeOf, numberFormat, relativeFormat } from '@/lib/intl';

/** Every value the page can show about a vehicle: the A6 vitals plus a few callout-only ones. */
export type InfoKey = VitalKey | 'vin' | 'licenseNo' | 'lastLocation' | 'lastFuel';

export type Tone = 'ok' | 'warn' | 'bad' | undefined;

export interface Info {
  label: string;
  /** Plain text, or null when the vehicle has no value for it. */
  value: string | null;
  /** Shown in mono numerals. */
  mono?: boolean;
  /** An identifier (VIN, plate): kept left-to-right inside <bdi> in Hebrew too. */
  ltr?: boolean;
  hint?: string;
  tone?: Tone;
  /** A service or inspection coming due: the card gets an orange or red frame, or turns red. */
  due?: DueLevel | null;
}

const DAY_MS = 86_400_000;
const SOON_DAYS = 30;

function daysUntil(iso: string, now: number) {
  return Math.ceil((Date.parse(iso) - now) / DAY_MS);
}

/** Returns a function that describes one value of `v`, in the active language. */
export function useVehicleInfo(v: VehicleDetail | undefined) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const formatDate = useDateFormat();
  const lang = i18n.language;
  const num = numberFormat(localeOf(lang), { maximumFractionDigits: 1 });
  const relative = relativeFormat(localeOf(lang), { numeric: 'auto' });
  const [now] = useState(Date.now);
  const fuelAge = useFuelAge();

  const usage = (km: number | null, hours: number | null) => {
    if (v?.usageUnit === 'HOURS')
      return hours === null ? null : t('vehicle.units.hours', { value: num.format(hours) });
    return km === null ? null : t('vehicle.units.km', { value: num.format(km) });
  };
  const countdown = (iso: string | null): Pick<Info, 'value' | 'hint' | 'tone' | 'due'> => {
    if (!iso) return { value: null };
    const days = daysUntil(iso, now);
    return {
      value: relative.format(days, 'day'),
      hint: formatDate(iso),
      tone: days < 0 ? 'bad' : days <= SOON_DAYS ? 'warn' : undefined,
      due: dueByDate(iso, now),
    };
  };
  const place = (code: string | null) =>
    code
      ? (lookupName(
          lookups?.locations.find((l) => l.code === code),
          lang,
        ) ?? code)
      : null;

  return (key: InfoKey): Info => {
    const label = t(`vehicle.info.${key}`);
    if (!v) return { label, value: null };
    const c = v.computed;
    switch (key) {
      case 'status':
        return {
          label,
          value: `${t(`status.${v.status}`)} · ${num.format(v.readinessPct)}%`,
          tone: v.status === 'GREEN' ? 'ok' : v.status === 'AMBER' ? 'warn' : 'bad',
        };
      case 'usage':
        return {
          label: t(`vehicle.info.usage_${v.usageUnit}`),
          value: usage(v.odometerKm, v.engineHours),
          mono: true,
        };
      case 'nextService': {
        // Whichever comes first: the date, or the km / hours reading.
        const reading = usage(v.nextServiceKm, v.nextServiceHours);
        const date = countdown(v.nextServiceDate);
        const parts = [date.value, reading].filter(Boolean);
        const hoursLeft =
          v.usageUnit === 'HOURS' && v.nextServiceHours !== null && v.engineHours !== null
            ? v.nextServiceHours - v.engineHours
            : null;
        const due = worstDue(date.due, dueByHours(hoursLeft));
        return {
          label,
          value: parts.length ? parts.join(' · ') : null,
          hint: date.hint,
          tone: due === 'soon' ? 'warn' : due ? 'bad' : date.tone,
          due,
        };
      }
      case 'annualTest':
        return { label, ...countdown(v.annualTestExpiry) };
      case 'insurance':
        return { label, ...countdown(v.insuranceExpiry) };
      case 'safetyCheck':
        return { label, ...countdown(v.safetyCheckExpiry) };
      case 'location':
        return { label, value: place(v.location) };
      case 'department':
        return {
          label,
          value: v.department
            ? (lookupName(
                lookups?.departments.find((d) => d.code === v.department),
                lang,
              ) ?? null)
            : null,
        };
      case 'operator':
        return { label, value: v.operatorName };
      case 'makeModelYear':
        return { label, value: [v.make, v.model, v.year].filter(Boolean).join(' ') };
      case 'openMalfunctions':
        return {
          label,
          value: num.format(c.openMalfunctions),
          mono: true,
          tone: c.openMalfunctions > 0 ? 'warn' : undefined,
        };
      case 'fuelEconomy':
        return {
          label,
          value: c.fuelEconomy30d
            ? t(`vehicle.units.${c.fuelEconomy30d.unit}`, {
                value: num.format(c.fuelEconomy30d.value),
              })
            : null,
          mono: true,
        };
      case 'fuelLevel': {
        const level = c.fuelLevel;
        if (!level) return { label, value: null };
        const state = fuelState(level, now);
        return {
          label,
          value: `${fuelAmount(level, num)} · ${t(`fuel.state.${state}`)}`,
          hint: fuelAge(level.at, now),
          tone: level.pct !== null && level.pct <= FUEL_LOW_PCT ? 'bad' : undefined,
          mono: true,
        };
      }
      case 'maintenanceCostYtd':
        return { label, value: formatMoney(c.maintenanceCostYtd, lang), mono: true };
      case 'purchaseWarranty': {
        const parts = [
          v.purchaseDate && t('vehicle.info.purchased', { date: formatDate(v.purchaseDate) }),
          v.warrantyExpiry &&
            t('vehicle.info.warrantyUntil', { date: formatDate(v.warrantyExpiry) }),
        ].filter(Boolean);
        return { label, value: parts.length ? parts.join(' · ') : null };
      }
      case 'lastActivity':
        return {
          label,
          value: c.lastActivity ? relative.format(daysUntil(c.lastActivity, now), 'day') : null,
          hint: c.lastActivity ? formatDate(c.lastActivity) : undefined,
        };
      case 'vin':
        return { label, value: v.vin, mono: true, ltr: true };
      case 'licenseNo':
        return { label, value: v.licenseNo, mono: true, ltr: true };
      case 'lastLocation':
        return {
          label,
          value: place(c.lastMovement?.to ?? v.location),
          hint: c.lastMovement ? formatDate(c.lastMovement.date) : undefined,
        };
      case 'lastFuel':
        return {
          label,
          value: c.lastFuel
            ? t('vehicle.info.lastFuelValue', {
                liters: num.format(c.lastFuel.liters),
                date: formatDate(c.lastFuel.date),
              })
            : null,
        };
    }
  };
}
