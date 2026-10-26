import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, CircleCheck, CircleX, Plus, TriangleAlert } from 'lucide-react';
import { VEHICLE_STATUSES, VEHICLE_TYPE_CODES, type VehicleStatus } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { cn } from '@/lib/cn';
import { fade } from '@/lib/motion';
import { lookupName, useLookups, type Tile } from './data';
import { useHover } from './hover';
import { Chip } from './Timeline';

const STATUS_ICON: Record<VehicleStatus, { icon: typeof CircleCheck; tone: string }> = {
  GREEN: { icon: CircleCheck, tone: 'text-ok' },
  AMBER: { icon: TriangleAlert, tone: 'text-warn' },
  RED: { icon: CircleX, tone: 'text-bad' },
};
export const TILE_DRAWING_PX = 44;
const COLLAPSED_KEY = 'fh.grid.collapsed';

function loadCollapsed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useDateFormat() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
      dateStyle: 'medium',
    }).format(new Date(iso));
}

function HoverCard({ tile }: { tile: Tile }) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const formatDate = useDateFormat();
  const location = lookupName(
    lookups?.locations.find((l) => l.code === tile.location),
    i18n.language,
  );
  return (
    <motion.div
      role="tooltip"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={fade.fast}
      className="pointer-events-none absolute -inset-x-12 bottom-full z-20 mb-2 flex justify-center"
    >
      <div className="glass bg-surface-strong w-52 p-3 text-start text-xs shadow-lg">
        <p className="mb-1.5 text-sm font-medium">
          {tile.make} {tile.model}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">{t('dashboard.location')}</dt>
          <dd>{location ?? t('dashboard.notSet')}</dd>
          <dt className="text-muted">{t('dashboard.nextService')}</dt>
          <dd className="num">
            {tile.nextServiceDate ? formatDate(tile.nextServiceDate) : t('dashboard.notSet')}
          </dd>
          <dt className="text-muted">{t('dashboard.openIssues')}</dt>
          <dd className={cn('num', tile.openIssues > 0 && 'text-warn')}>{tile.openIssues}</dd>
        </dl>
      </div>
    </motion.div>
  );
}

function TileButton({
  tile,
  away,
  delay,
  carried,
  linked,
}: {
  tile: Tile;
  away: boolean;
  delay: number;
  carried: boolean;
  linked: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hover = useHover();
  const [open, setOpen] = useState(false);
  const { icon: Icon, tone } = STATUS_ICON[tile.status];

  const show = (on: boolean) => {
    setOpen(on);
    hover.setSerial(on ? tile.serial : null);
  };

  return (
    <motion.li
      className="relative w-[5.25rem]"
      initial={false}
      // The chosen tile only fades, so its slot keeps the size the vehicle flies back to.
      animate={away ? { opacity: 0, scale: carried ? 1 : 0.6 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay }}
    >
      <motion.button
        type="button"
        data-tile={tile.serial}
        aria-label={t('dashboard.openVehicle', { serial: tile.serial })}
        onClick={() =>
          navigate(`/vehicles/${encodeURIComponent(tile.serial)}`, {
            state: { fromDashboard: true },
          })
        }
        onPointerEnter={(e) => e.pointerType === 'mouse' && show(true)}
        onPointerLeave={() => show(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(true)}
        onBlur={() => show(false)}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className={cn(
          'border-border bg-surface flex w-full flex-col items-center gap-1.5 rounded-xl border px-1 pt-3 pb-2',
          'hover:border-border-strong',
          linked && 'border-accent/70 ring-accent/40 ring-2',
        )}
      >
        <div data-tile-visual={tile.serial} style={{ opacity: carried ? 0 : 1 }}>
          <VehicleVisual type={tile.type} view="top" status={tile.status} size={TILE_DRAWING_PX} />
        </div>
        <span className="flex items-center gap-1 text-xs">
          <Icon aria-hidden className={cn('size-3.5', tone)} />
          <span className="sr-only">{t(`status.${tile.status}`)}</span>
          <bdi dir="ltr" className="num">
            {tile.serial}
          </bdi>
        </span>
      </motion.button>
      <AnimatePresence>{open && !away && <HoverCard tile={tile} />}</AnimatePresence>
    </motion.li>
  );
}

interface GridProps {
  tiles: Tile[];
  /** Serial on the detail stage; its tile is the origin of the ripple. */
  activeSerial: string | null;
  /** True while the detail stage is open: tiles ripple out. */
  away: boolean;
}

/** Fleet grid: top-down tiles tinted by status, grouped by type in collapsible sections. */
export function FleetGrid({ tiles, activeSerial, away }: GridProps) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const { data: user } = useSession();
  const hover = useHover();
  const rootRef = useRef<HTMLDivElement>(null);
  const [statuses, setStatuses] = useState<VehicleStatus[]>([]);
  const [type, setType] = useState('');
  const [department, setDepartment] = useState('');
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [delays, setDelays] = useState<Record<string, number>>({});

  const visible = tiles.filter(
    (v) =>
      (!statuses.length || statuses.includes(v.status)) &&
      (!type || v.type === type) &&
      (!department || v.department === department),
  );
  const sections = useMemo(() => {
    const order = (code: string) => {
      const i = VEHICLE_TYPE_CODES.indexOf(code as (typeof VEHICLE_TYPE_CODES)[number]);
      return i === -1 ? VEHICLE_TYPE_CODES.length : i;
    };
    const byType = new Map<string, Tile[]>();
    for (const v of visible) byType.set(v.type, [...(byType.get(v.type) ?? []), v]);
    return [...byType.entries()].sort(([a], [b]) => order(a) - order(b));
  }, [visible]);

  // Ripple: each tile leaves (and returns) after a delay that grows with its distance from the chosen tile.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !activeSerial) return;
    const origin = root
      .querySelector(`[data-tile="${CSS.escape(activeSerial)}"]`)
      ?.getBoundingClientRect();
    if (!origin) return setDelays({});
    const cx = origin.left + origin.width / 2;
    const cy = origin.top + origin.height / 2;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>('[data-tile]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      next[el.dataset.tile!] = Math.min(0.25, d / 2400);
    });
    setDelays(next);
  }, [activeSerial]);

  const toggleSection = (code: string) =>
    setCollapsed((cur) => {
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // Private mode: remembered for this visit only.
      }
      return next;
    });
  const filtered = statuses.length > 0 || !!type || !!department;
  const canAdd = user?.role === 'EDITOR' || user?.role === 'ADMIN';
  const lang = i18n.language;

  return (
    <section
      aria-labelledby="fleet-title"
      className="relative isolate p-3"
      ref={rootRef}
      data-testid="fleet-grid"
    >
      {/* The panel itself fades after the tiles, so nothing of the grid shows behind the vehicle. */}
      <motion.div
        aria-hidden
        className="glass absolute inset-0 -z-10"
        initial={false}
        animate={{ opacity: away ? 0 : 1 }}
        transition={away ? { duration: 0.2, delay: 0.1 } : fade.fast}
      />
      <motion.div
        initial={false}
        animate={{ opacity: away ? 0 : 1 }}
        transition={fade.base}
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        <h2 id="fleet-title" className="me-auto text-sm font-semibold">
          {t('dashboard.fleet')}
        </h2>
        <div
          role="group"
          aria-label={t('dashboard.filters.status')}
          className="flex flex-wrap gap-1.5"
        >
          {VEHICLE_STATUSES.map((s) => {
            const { icon: Icon, tone } = STATUS_ICON[s];
            return (
              <Chip
                key={s}
                pressed={statuses.includes(s)}
                onClick={() =>
                  setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                }
              >
                <Icon aria-hidden className={cn('size-3.5', tone)} />
                {t(`status.${s}`)}
              </Chip>
            );
          })}
        </div>
        <label className="sr-only" htmlFor="filter-type">
          {t('dashboard.filters.type')}
        </label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border-border bg-surface-strong h-7 rounded-lg border px-2 text-xs"
        >
          <option value="">
            {t('dashboard.filters.type')}: {t('dashboard.filters.all')}
          </option>
          {lookups?.vehicleTypes.map((vt) => (
            <option key={vt.code} value={vt.code}>
              {lookupName(vt, lang)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-department">
          {t('dashboard.filters.department')}
        </label>
        <select
          id="filter-department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="border-border bg-surface-strong h-7 rounded-lg border px-2 text-xs"
        >
          <option value="">
            {t('dashboard.filters.department')}: {t('dashboard.filters.all')}
          </option>
          {lookups?.departments.map((d) => (
            <option key={d.code} value={d.code}>
              {lookupName(d, lang)}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            type="button"
            className="text-accent text-xs hover:underline"
            onClick={() => {
              setStatuses([]);
              setType('');
              setDepartment('');
            }}
          >
            {t('dashboard.filters.clear')}
          </button>
        )}
      </motion.div>

      {sections.length === 0 && (
        <p className="text-muted py-10 text-center text-sm">{t('dashboard.noVehicles')}</p>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {sections.map(([code, list]) => {
          const isCollapsed = collapsed.includes(code);
          const name =
            lookupName(
              lookups?.vehicleTypes.find((vt) => vt.code === code),
              lang,
            ) ?? code;
          return (
            <section key={code} aria-label={name} data-section={code}>
              <motion.button
                type="button"
                initial={false}
                animate={{ opacity: away ? 0 : 1 }}
                transition={fade.base}
                aria-expanded={!isCollapsed}
                onClick={() => toggleSection(code)}
                className="text-muted hover:text-text mb-1.5 flex items-center gap-1.5 text-xs font-medium"
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform',
                    isCollapsed && '-rotate-90 rtl:rotate-90',
                  )}
                />
                <span>{name}</span>
                <span aria-hidden className="num">
                  · {list.length}
                </span>
                <span className="sr-only">
                  {t('dashboard.sectionCount', { count: list.length })}
                </span>
              </motion.button>
              {!isCollapsed && (
                <ul className="flex flex-wrap gap-2">
                  {list.map((tile) => (
                    <TileButton
                      key={tile.serial}
                      tile={tile}
                      away={away}
                      delay={away ? (delays[tile.serial] ?? 0) : 0.25 - (delays[tile.serial] ?? 0)}
                      carried={tile.serial === activeSerial}
                      linked={hover.event?.serial === tile.serial}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {canAdd && (
        <motion.div
          initial={false}
          animate={{ opacity: away ? 0 : 1 }}
          transition={fade.base}
          className="mt-3"
        >
          <button
            type="button"
            disabled
            title={t('topbar.comingSoon')}
            className="border-border-strong text-muted flex h-24 w-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs disabled:cursor-not-allowed"
          >
            <Plus aria-hidden className="size-5" />
            {t('dashboard.addVehicle')}
          </button>
        </motion.div>
      )}
    </section>
  );
}
