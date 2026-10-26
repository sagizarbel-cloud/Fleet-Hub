import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useAnimate } from 'motion/react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { DetailView } from '@fleet-hub/shared';
import { DETAIL_VIEWS } from '@fleet-hub/shared';
import { StatusBadge } from '@/components/StatusBadge';
import { HeroVisual, type HeroPose } from '@/drawings/HeroVisual';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { Activity } from '@/vehicle/Activity';
import { CALLOUT_ROOM, CalloutLegend, CalloutOverlay } from '@/vehicle/Callouts';
import { usePreferences, useSavePreferences, useVehicle } from '@/vehicle/data';
import { CopyId, StartCodeChip } from '@/vehicle/Identity';
import { ItemsTable } from '@/vehicle/ItemsTable';
import { Records } from '@/vehicle/Records';
import { VehicleNav, type SlideDirection } from '@/vehicle/VehicleNav';
import { VitalsBar } from '@/vehicle/VitalsBar';
import { lookupName, useLookups, type Tile } from './data';

// The last view is cached here so the transition can pick its final pose at once;
// the saved preference (per user, on the server) is the source of truth.
const VIEW_KEY = 'fh.vehicleView';

// Timeline of the transition, in seconds (SPEC 5.2: all of it within 1.2 s).
const T = { fly: 0.45, toIso: 0.32, toSide: 0.52, panels: 0.35, flatten: 0.35, flyBack: 0.45 };
const EASE = [0.22, 1, 0.36, 1] as const;
const SLIDE_PX = 56;

function cachedView(): DetailView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'iso' ? 'iso' : 'side';
  } catch {
    return 'side';
  }
}
function cacheView(v: DetailView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Private mode: the server copy still applies.
  }
}

function heroSize() {
  return Math.round(Math.min(340, Math.max(220, window.innerWidth - 120)));
}

/** Tracks an element's width. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Props {
  serial: string;
  tile: Tile | undefined;
  tiles: Tile[];
  loading: boolean;
  returning: boolean;
  /** Fly in from the grid tile (false for a deep link). */
  fromDashboard: boolean;
  /** Arrived from the neighbouring vehicle with Prev / Next: slide in from that side. */
  slide: SlideDirection | null;
  onReturnStart: () => void;
  onClosed: () => void;
}

/**
 * The vehicle's page on the shared stage (SPEC 5.2, 5.3). The drawing flies from its tile,
 * tilts, turns to its side profile and the panels arrive; Back plays it all in reverse.
 */
export function VehicleStage({
  serial,
  tile,
  tiles,
  loading,
  returning,
  fromDashboard,
  slide,
  onReturnStart,
  onClosed,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const highlightId = params.get('event');
  const { data: lookups } = useLookups();
  const detail = useVehicle(serial);
  const vehicle = detail.data;
  const prefs = usePreferences();
  const savePrefs = useSavePreferences();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const heroRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [heroPanelRef, heroPanelWidth] = useWidth<HTMLDivElement>();
  const [view, setView] = useState<DetailView>(cachedView);
  const [reduced] = useState(prefersReducedMotion);
  // A slide (Prev / Next) or reduced motion skips the fly-in and starts in the chosen pose.
  const [instant] = useState(() => reduced || slide !== null);
  const [pose, setPose] = useState<HeroPose>(() => (instant ? view : 'flat'));
  const [size] = useState(heroSize);
  const [seenPref, setSeenPref] = useState<DetailView | null>(null);
  const timers = useRef<number[]>([]);
  const rtl = i18n.dir() === 'rtl';

  // The saved preference arrived and differs from the cached one: follow it.
  const savedView = prefs.data?.detailView ?? null;
  if (savedView && savedView !== seenPref) {
    setSeenPref(savedView);
    if (savedView !== view) {
      setView(savedView);
      if (pose !== 'flat') setPose(savedView);
    }
  }
  useEffect(() => {
    if (savedView) cacheView(savedView);
  }, [savedView]);

  const later = (seconds: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, seconds * 1000));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /** Where the hero must move (and how much scale) to sit exactly on its grid tile. */
  const offsetToTile = useCallback(() => {
    const hero = heroRef.current;
    const target = document.querySelector(`[data-tile-visual="${CSS.escape(serial)}"]`);
    if (!hero || !target) return null;
    const to = target.getBoundingClientRect();
    if (to.width === 0) return null;
    const saved = hero.style.transform;
    hero.style.transform = 'none';
    const from = hero.getBoundingClientRect();
    hero.style.transform = saved;
    return {
      x: to.left + to.width / 2 - (from.left + from.width / 2),
      y: to.top + to.height / 2 - (from.top + from.height / 2),
      // Heights match: the flat drawing fills the hero's height, as it fills the tile drawing's.
      scale: to.height / from.height,
    };
  }, [serial]);

  // Enter: fly from the tile, tilt to isometric, then (if preferred) turn to the side profile.
  useLayoutEffect(() => {
    if (!tile) return;
    const hero = heroRef.current!;
    if (instant) {
      if (reduced) void animate(hero, { opacity: [0, 1] }, { duration: 0.2 });
    } else {
      const start = fromDashboard ? offsetToTile() : null;
      if (start) {
        void animate(hero, { ...start, opacity: 1 }, { duration: 0 });
        void animate(
          hero,
          { x: 0, y: 0, scale: 1 },
          { type: 'spring', duration: T.fly, bounce: 0.12 },
        );
      } else {
        void animate(hero, { opacity: [0, 1], scale: [0.9, 1] }, { duration: 0.3, ease: EASE });
      }
      later(T.toIso, () => setPose('iso'));
      if (view === 'side') later(T.toSide, () => setPose('side'));
    }
    backRef.current?.focus({ preventScroll: true });
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per vehicle arrival
  }, [!!tile]);

  // Back: panels leave and the drawing flattens, then it flies home to its tile.
  useEffect(() => {
    if (!returning) return;
    clearTimers();
    const hero = heroRef.current;
    if (!hero || reduced) {
      onReturnStart();
      if (hero) void animate(hero, { opacity: 0 }, { duration: 0.2 }).then(onClosed);
      else onClosed();
      return;
    }
    void animate('[data-panel]', { opacity: 0 }, { duration: 0.2 });
    later(T.flatten, () => {
      onReturnStart();
      const end = offsetToTile();
      const fly = end
        ? animate(hero, end, { type: 'spring', duration: T.flyBack, bounce: 0 })
        : animate(hero, { opacity: 0, scale: 0.9 }, { duration: 0.25 });
      void fly.then(onClosed);
    });
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when Back starts
  }, [returning]);

  const back = useCallback(() => {
    if (returning) return;
    if (fromDashboard) navigate(-1);
    else navigate('/');
  }, [returning, fromDashboard, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  useEffect(() => {
    document.title = `${serial} · ${t('app.name')}`;
  }, [serial, t]);

  // Swipe toward the inline end (right in English, left in Hebrew) goes back.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = (e.clientX - s.x) * (rtl ? -1 : 1);
    if (dx > 80 && Math.abs(e.clientY - s.y) < 60) back();
  };

  const chooseView = (v: DetailView) => {
    setView(v);
    setPose(v);
    cacheView(v);
    savePrefs.mutate({ detailView: v });
  };

  const panel = (from: 'top' | 'side' | 'bottom', delay: number) =>
    reduced || slide
      ? {
          initial: { opacity: reduced ? 0 : 1 },
          animate: { opacity: 1 },
          transition: { duration: 0.2 },
        }
      : {
          initial: {
            opacity: 0,
            x: from === 'side' ? (rtl ? -40 : 40) : 0,
            y: from === 'top' ? -24 : from === 'bottom' ? 32 : 0,
          },
          animate: { opacity: 1, x: 0, y: 0 },
          transition: { duration: 0.35, ease: EASE, delay },
        };

  const headerMotion = panel('top', T.panels);
  const toggleMotion = panel('bottom', T.panels);
  const asideMotion = panel('side', T.panels + 0.05);
  const recordMotion = (i: number) => panel('bottom', T.panels + 0.05 + i * 0.02);
  const lowerMotion = panel('bottom', T.panels + 0.12);
  // Prev / Next: the whole page slides in from the side it came from.
  const pageMotion =
    slide && !reduced
      ? {
          initial: { opacity: 0, x: slide * SLIDE_PX * (rtl ? -1 : 1) },
          animate: { opacity: 1, x: 0 },
          transition: { duration: 0.28, ease: EASE },
        }
      : {};

  const typeName =
    tile &&
    lookupName(
      lookups?.vehicleTypes.find((v) => v.code === tile.type),
      i18n.language,
    );
  const compactCallouts = heroPanelWidth < size * 1.35 + CALLOUT_ROOM;
  const showCallouts = pose === 'side' && !returning && !!vehicle;
  const notFound = !loading && !tile;

  return (
    <div
      ref={scope}
      className="fixed inset-x-0 bottom-0 z-30 overflow-y-auto pb-8"
      style={{ top: 'var(--fh-header-h, 7.5rem)' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      data-testid="vehicle-stage"
      data-serial={serial}
    >
      <motion.div
        {...pageMotion}
        className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-4 px-2 pt-2 sm:px-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0 space-y-4">
          <motion.header data-panel {...headerMotion} className="glass relative z-10 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                ref={backRef}
                type="button"
                onClick={back}
                className="border-border hover:bg-border grid size-9 place-items-center rounded-lg border"
                aria-label={t('vehicle.back')}
                title={t('vehicle.back')}
              >
                <ArrowLeft aria-hidden className="size-4 rtl:-scale-x-100" />
              </button>
              {tile && (
                <>
                  <div className="me-auto min-w-0">
                    <p className="text-muted text-xs">{typeName}</p>
                    <h1 className="truncate text-lg font-semibold">
                      {tile.make} {tile.model}
                    </h1>
                  </div>
                  <StatusBadge status={vehicle?.status ?? tile.status} />
                  <VehicleNav serial={serial} tiles={tiles} />
                </>
              )}
            </div>
            {tile && (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-end">
                  <div className="col-span-2 sm:col-span-1">
                    <CopyId label={t('vehicle.info.serial')} value={tile.serial} large />
                  </div>
                  <CopyId label={t('vehicle.info.vin')} value={vehicle ? vehicle.vin : null} />
                  <CopyId
                    label={t('vehicle.info.licenseNo')}
                    value={vehicle ? vehicle.licenseNo : null}
                  />
                  {vehicle?.hasStartCode && <StartCodeChip serial={serial} />}
                </dl>
                <VitalsBar vehicle={vehicle} />
              </>
            )}
          </motion.header>

          <div ref={heroPanelRef} className="relative">
            {/* The stage's panel fades in behind the drawing, so the flight is never clipped. */}
            {tile && (
              <motion.div
                data-panel
                {...toggleMotion}
                aria-hidden
                className="glass absolute inset-0"
              />
            )}
            <div className="relative grid place-items-center py-2">
              {tile ? (
                <div
                  ref={heroRef}
                  style={{ opacity: fromDashboard && !instant ? 0 : undefined }}
                  data-hero
                >
                  <HeroVisual
                    type={tile.type}
                    status={vehicle?.status ?? tile.status}
                    pose={returning ? 'flat' : pose}
                    size={size}
                    sideOverlay={
                      showCallouts
                        ? (box) => (
                            <CalloutOverlay
                              vehicle={vehicle}
                              width={box.width}
                              height={box.height}
                              compact={compactCallouts}
                              reduced={reduced || !!slide}
                            />
                          )
                        : undefined
                    }
                  />
                </div>
              ) : loading ? (
                <Loader2 aria-hidden className="text-muted my-24 size-6 animate-spin" />
              ) : (
                <p className="text-muted my-24 text-sm">{t('vehicle.notFound', { serial })}</p>
              )}
              {tile && (
                <motion.div
                  data-panel
                  {...toggleMotion}
                  role="group"
                  aria-label={t('vehicle.view')}
                  className="border-border bg-surface absolute end-2 top-2 flex rounded-lg border p-0.5 text-xs"
                >
                  {DETAIL_VIEWS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => chooseView(v)}
                      className={cn(
                        'rounded-md px-2.5 py-1',
                        view === v ? 'bg-accent text-accent-contrast' : 'text-muted',
                      )}
                    >
                      {t(v === 'side' ? 'vehicle.sideView' : 'vehicle.isoView')}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>
            {showCallouts && compactCallouts && <CalloutLegend vehicle={vehicle} />}
          </div>

          {/* Mounted with the other panels so they arrive together; contents fill in as data loads. */}
          {tile && (
            <Records serial={serial} vehicle={vehicle} motionFor={recordMotion} reduced={reduced} />
          )}
          {tile && (
            <motion.div data-panel {...lowerMotion}>
              {vehicle ? (
                <ItemsTable vehicle={vehicle} />
              ) : (
                <div aria-hidden className="glass h-24" />
              )}
            </motion.div>
          )}
          {tile && detail.isError && (
            <p role="alert" className="text-bad text-sm">
              {t('vehicle.loadFailed')}
            </p>
          )}
        </div>

        {tile && !notFound && (
          <motion.aside
            data-panel
            {...asideMotion}
            aria-labelledby="activity-title"
            className="glass flex max-h-[calc(100dvh-10rem)] min-h-0 flex-col p-3 lg:sticky lg:top-0"
          >
            <Activity
              serial={serial}
              highlightId={highlightId}
              reduced={reduced}
              revealDelayMs={(T.panels + 0.4) * 1000}
            />
          </motion.aside>
        )}
      </motion.div>
    </div>
  );
}
