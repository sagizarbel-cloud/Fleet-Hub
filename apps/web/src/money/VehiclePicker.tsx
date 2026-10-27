import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Search, X } from 'lucide-react';
import { VEHICLE_TYPE_CODES } from '@fleet-hub/shared';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { drawingFor } from '@/drawings/registry';
import { lookupName, useDashboard, useLookups, type Tile } from '@/fleet/data';
import { cn } from '@/lib/cn';

const BOX = 40;
const miniSize = (type: string) => {
  const { top } = drawingFor(type);
  return Math.min(BOX * 0.6, (BOX * top.width) / top.height);
};

/** A vehicle's mini top-down drawing and serial, as a tag. */
export function VehicleTagChip({
  serial,
  type,
  onRemove,
}: {
  serial: string;
  type: string;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className="border-border bg-surface inline-flex h-8 items-center gap-1.5 rounded-full border ps-1.5 pe-2.5 text-xs">
      <span className="grid w-5 place-items-center">
        <VehicleVisual type={type} view="top" status="GREEN" size={miniSize(type) * 0.5} />
      </span>
      <bdi dir="ltr" className="num">
        {serial}
      </bdi>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted hover:text-bad -me-1"
          aria-label={t('picker.remove', { serial })}
          title={t('picker.remove', { serial })}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * "+ Assign vehicle": the chosen vehicles as tags, and a searchable grid of mini drawings to
 * add more (SPEC 5.6). `single` keeps one vehicle at most.
 */
export function VehiclePicker({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string[];
  onChange: (serials: string[]) => void;
  invalid?: boolean;
  label: string;
}) {
  const { t, i18n } = useTranslation();
  const { data } = useDashboard();
  const { data: lookups } = useLookups();
  const [open, setOpen] = useState(value.length === 0);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const tiles = useMemo(() => data?.tiles ?? [], [data]);
  const bySerial = useMemo(() => new Map(tiles.map((v) => [v.serial, v])), [tiles]);
  const types = VEHICLE_TYPE_CODES.filter((c) => tiles.some((v) => v.type === c));
  const typeName = (code: string) =>
    lookupName(
      lookups?.vehicleTypes.find((v) => v.code === code),
      i18n.language,
    ) ?? code;

  const needle = q.trim().toLowerCase();
  const shown = tiles.filter(
    (v: Tile) =>
      (!type || v.type === type) &&
      (!needle ||
        [v.serial, v.make, v.model, v.licenseNo ?? ''].some((s) =>
          s.toLowerCase().includes(needle),
        )),
  );
  const toggle = (serial: string) =>
    onChange(value.includes(serial) ? value.filter((s) => s !== serial) : [...value, serial]);

  return (
    <fieldset className="space-y-2" data-testid="vehicle-picker">
      <legend className="mb-1 text-xs font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((s) => (
          <VehicleTagChip
            key={s}
            serial={s}
            type={bySerial.get(s)?.type ?? 'other'}
            onRemove={() => toggle(s)}
          />
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'border-border-strong hover:bg-border inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-xs',
            invalid && 'border-bad text-bad',
          )}
          data-testid="assign-vehicle"
        >
          <Plus aria-hidden className="size-3.5" />
          {t('picker.assign')}
        </button>
      </div>
      {open && (
        <div className="border-border space-y-2 rounded-xl border p-2">
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-40 flex-1">
              <span className="sr-only">{t('picker.search')}</span>
              <Search
                aria-hidden
                className="text-muted pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('picker.search')}
                className="border-border-strong bg-surface h-8 w-full rounded-md border ps-7 pe-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]"
                data-testid="picker-search"
              />
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label={t('picker.type')}
              className="border-border-strong bg-surface h-8 rounded-md border px-2 text-sm"
            >
              <option value="">{t('picker.allTypes')}</option>
              {types.map((c) => (
                <option key={c} value={c}>
                  {typeName(c)}
                </option>
              ))}
            </select>
          </div>
          <ul className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto p-0.5">
            {shown.map((v) => {
              const on = value.includes(v.serial);
              return (
                <li key={v.serial}>
                  <button
                    type="button"
                    onClick={() => toggle(v.serial)}
                    aria-pressed={on}
                    title={`${v.make} ${v.model}`}
                    className={cn(
                      'border-border bg-surface relative flex w-full flex-col items-center gap-1 rounded-lg border px-1 pt-2 pb-1.5 text-xs',
                      on ? 'border-accent ring-accent/40 ring-2' : 'hover:border-border-strong',
                    )}
                    data-testid="picker-vehicle"
                  >
                    {on && (
                      <Check
                        aria-hidden
                        className="bg-accent text-accent-contrast absolute end-1 top-1 size-4 rounded-full p-0.5"
                      />
                    )}
                    <span className="grid place-items-center" style={{ height: BOX }}>
                      <VehicleVisual
                        type={v.type}
                        view="top"
                        status={v.status}
                        size={miniSize(v.type)}
                      />
                    </span>
                    <bdi dir="ltr" className="num">
                      {v.serial}
                    </bdi>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="text-muted col-span-full py-3 text-center text-xs">
                {t('picker.none')}
              </li>
            )}
          </ul>
        </div>
      )}
    </fieldset>
  );
}
