import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Package, Plus } from 'lucide-react';
import {
  hasRole,
  VEHICLE_STATUSES,
  VEHICLE_TYPE_CODES,
  type VehicleStatus,
} from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { drawingFor } from '@/drawings/registry';
import { VehicleVisual } from '@/drawings/VehicleVisual';
import { Button } from '@/components/ui/button';
import { isolate } from '@/lib/bidi';
import { cn } from '@/lib/cn';
import { fade, prefersReducedMotion, spring } from '@/lib/motion';
import { useItemMove } from '@/money/api';
import { hasFiles, hasItem, ITEM_MIME } from '@/money/drag';
import { lookupName, useLookups, type Tile } from './data';
import { useHover } from './hover';
import { STATUS_ICON } from './statusIcon';
import type { PickedItem } from './EquipmentTray';
import { Chip } from './Timeline';

// Both load only when used: a file dropped on a tile, or the equipment tray opened.
const ReceiptForm = lazy(() =>
  import('@/money/ReceiptForm').then((m) => ({ default: m.ReceiptForm })),
);
const EquipmentTray = lazy(() => import('./EquipmentTray'));

/** Isometric tilt: the top view tipped onto a turntable. */
const ISO_TILT = 54.74;

type DropWhat = 'file' | 'item';

/** What a tile needs to take a dropped file or item, or a tapped item on a phone. */
interface DropHandlers {
  reduced: boolean;
  canAssign: boolean;
  picking: boolean;
  onFiles: (serial: string, files: File[]) => void;
  onItem: (serial: string, item: PickedItem) => void;
  onPicked: (serial: string) => void;
}

// Top-view drawings fit a box of this size, so long machines (an excavator's arm) stay in the grid.
const TILE_BOX = { width: 48, height: 84 };

function tileSize(type: string) {
  const { top } = drawingFor(type);
  return Math.min(TILE_BOX.width, (TILE_BOX.height * top.width) / top.height);
}
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

function DropHint({ text }: { text: string }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={fade.fast}
      className="pointer-events-none absolute -inset-x-16 bottom-full z-20 mb-3 flex justify-center"
    >
      <p className="bg-accent text-accent-contrast rounded-full px-3 py-1 text-center text-xs font-medium shadow-lg">
        {text}
      </p>
    </motion.div>
  );
}

function TileButton({
  tile,
  away,
  delay,
  carried,
  linked,
  drop,
}: {
  tile: Tile;
  away: boolean;
  delay: number;
  carried: boolean;
  linked: boolean;
  drop: DropHandlers;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hover = useHover();
  const [open, setOpen] = useState(false);
  const { icon: Icon, tone } = STATUS_ICON[tile.status];

  const [over, setOver] = useState<DropWhat | null>(null);
  // Counts enter/leave pairs, since moving over the drawing inside the tile fires both.
  const depth = useRef(0);

  const show = (on: boolean) => {
    setOpen(on);
    hover.setSerial(on ? tile.serial : null);
  };

  const what = (e: DragEvent): DropWhat | null =>
    hasFiles(e) ? 'file' : drop.canAssign && hasItem(e) ? 'item' : null;
  const onDragEnter = (e: DragEvent) => {
    const w = what(e);
    if (!w) return;
    e.preventDefault();
    depth.current += 1;
    setOver(w);
  };
  const onDragOver = (e: DragEvent) => {
    if (!what(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasFiles(e) ? 'copy' : 'move';
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(null);
  };
  const onDrop = (e: DragEvent) => {
    const w = what(e);
    depth.current = 0;
    setOver(null);
    if (!w) return;
    e.preventDefault();
    if (w === 'file') return drop.onFiles(tile.serial, Array.from(e.dataTransfer.files));
    try {
      drop.onItem(tile.serial, JSON.parse(e.dataTransfer.getData(ITEM_MIME)) as PickedItem);
    } catch {
      // Not one of our items.
    }
  };
  // A drag that ends elsewhere (Esc, dropped outside) never sends this tile a leave.
  useEffect(() => {
    if (!over) return;
    const reset = () => {
      depth.current = 0;
      setOver(null);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, [over]);
  const tilted = !!over && !drop.reduced;

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
          drop.picking
            ? drop.onPicked(tile.serial)
            : navigate(`/vehicles/${encodeURIComponent(tile.serial)}`, {
                state: { fromDashboard: true },
              })
        }
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        animate={{ scale: over ? 1.1 : 1 }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show(true)}
        onPointerLeave={() => show(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(true)}
        onBlur={() => show(false)}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className={cn(
          'border-border bg-surface relative flex w-full flex-col items-center gap-1.5 rounded-xl border px-1 pt-3 pb-2',
          'hover:border-border-strong',
          linked && 'border-accent/70 ring-accent/40 ring-2',
          drop.picking && 'border-accent/60 border-dashed',
        )}
        data-drop={over ?? undefined}
      >
        {/* Glow while something is over the tile: a fixed shadow that only fades in and out. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-xl shadow-[0_0_0_2px_var(--fh-accent),0_0_22px_4px_color-mix(in_oklab,var(--fh-accent)_55%,transparent)]"
          initial={false}
          animate={{ opacity: over ? 1 : 0 }}
          transition={fade.base}
        />
        <div
          className="pointer-events-none grid place-items-center"
          style={{ height: TILE_BOX.height, perspective: 320 }}
        >
          <motion.div
            className="relative"
            style={{ transformStyle: 'preserve-3d' }}
            initial={false}
            animate={{ rotateX: tilted ? ISO_TILT : 0 }}
            transition={spring.smooth}
          >
            <div className={cn('relative', tilted && 'tile-turntable')}>
              {tilted && (
                <span
                  aria-hidden
                  className="border-accent/60 bg-accent/10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{ width: TILE_BOX.height, height: TILE_BOX.height }}
                />
              )}
              <div
                data-tile-visual={tile.serial}
                className="relative"
                style={{ opacity: carried ? 0 : 1 }}
              >
                <VehicleVisual
                  type={tile.type}
                  view="top"
                  status={tile.status}
                  size={tileSize(tile.type)}
                />
              </div>
            </div>
          </motion.div>
        </div>
        <span className="flex items-center gap-1 text-xs">
          <Icon aria-hidden className={cn('size-3.5', tone)} />
          <span className="sr-only">{t(`status.${tile.status}`)}</span>
          <bdi dir="ltr" className="num">
            {tile.serial}
          </bdi>
        </span>
      </motion.button>
      <AnimatePresence>
        {over ? (
          <DropHint
            key="drop"
            text={t(over === 'file' ? 'tray.dropFile' : 'tray.dropItem', {
              serial: isolate(tile.serial),
            })}
          />
        ) : (
          open && !away && <HoverCard key="card" tile={tile} />
        )}
      </AnimatePresence>
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
  const [reduced] = useState(prefersReducedMotion);
  const [trayOpen, setTrayOpen] = useState(false);
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [receipt, setReceipt] = useState<{ serial: string; files: File[] } | null>(null);
  const [confirm, setConfirm] = useState<{ item: PickedItem; serial: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const move = useItemMove();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
  const canAdd = !!user && hasRole(user.role, 'EDITOR');
  const lang = i18n.language;

  const askAssign = (serial: string, item: PickedItem) => {
    setPicked(null);
    if (item.from !== serial) setConfirm({ item, serial });
  };
  const drop: DropHandlers = {
    reduced,
    canAssign: canAdd,
    picking: !!picked,
    onFiles: (serial, files) => setReceipt({ serial, files }),
    onItem: askAssign,
    onPicked: (serial) => picked && askAssign(serial, picked),
  };
  const assign = async () => {
    if (!confirm) return;
    const { item, serial } = confirm;
    try {
      await move.mutateAsync({ id: item.id, action: 'assign', vehicle: serial });
      setNotice(t('tray.assigned', { item: item.name, serial: isolate(serial) }));
    } catch {
      setNotice(t('tray.failed'));
    }
    setConfirm(null);
  };

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
            className="text-accent-ink text-xs hover:underline"
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
                      drop={drop}
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
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              disabled
              title={t('topbar.comingSoon')}
              className="border-border-strong text-muted flex h-24 w-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs disabled:cursor-not-allowed"
            >
              <Plus aria-hidden className="size-5" />
              {t('dashboard.addVehicle')}
            </button>
            <button
              type="button"
              aria-expanded={trayOpen}
              onClick={() => {
                setTrayOpen((o) => !o);
                setPicked(null);
              }}
              className="text-muted hover:text-text ms-auto inline-flex items-center gap-1.5 text-xs"
              data-testid="tray-toggle"
            >
              <Package aria-hidden className="size-4" />
              {t(trayOpen ? 'tray.hide' : 'tray.show')}
            </button>
          </div>
          {trayOpen && (
            <Suspense fallback={null}>
              <EquipmentTray picked={picked} onPick={setPicked} />
            </Suspense>
          )}
        </motion.div>
      )}

      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <AnimatePresence mode="wait">
            {(confirm || picked || notice) && (
              <motion.div
                key={confirm ? 'confirm' : picked ? 'picked' : 'notice'}
                role={confirm ? 'alertdialog' : 'status'}
                aria-live="polite"
                initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : 16 }}
                transition={{ duration: 0.2 }}
                className="glass bg-surface-strong pointer-events-auto flex max-w-xl items-center gap-3 px-4 py-2.5 text-sm shadow-lg"
                data-testid="tray-bar"
              >
                {confirm ? (
                  <>
                    <span className="me-auto">
                      {confirm.item.from
                        ? t('tray.confirmMove', {
                            item: confirm.item.name,
                            from: isolate(confirm.item.from),
                            serial: isolate(confirm.serial),
                          })
                        : t('tray.confirm', {
                            item: confirm.item.name,
                            serial: isolate(confirm.serial),
                          })}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                        {t('tray.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void assign()}
                        disabled={move.isPending}
                        data-testid="tray-confirm"
                      >
                        {t('tray.yes')}
                      </Button>
                    </span>
                  </>
                ) : picked ? (
                  <>
                    <span className="me-auto">{t('tray.picked', { item: picked.name })}</span>
                    <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                      {t('tray.cancel')}
                    </Button>
                  </>
                ) : (
                  <span>{notice}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body,
      )}
      {receipt && (
        <Suspense fallback={null}>
          <ReceiptForm
            vehicles={[receipt.serial]}
            files={receipt.files}
            reduced={reduced}
            onClose={() => setReceipt(null)}
            onSaved={setNotice}
          />
        </Suspense>
      )}
    </section>
  );
}
