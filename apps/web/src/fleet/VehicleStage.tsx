import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useAnimate } from 'motion/react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ClipboardCheck,
  Droplet,
  FileText,
  Fuel,
  Loader2,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { HeroVisual, type HeroPose } from '@/drawings/HeroVisual';
import { cn } from '@/lib/cn';
import { prefersReducedMotion } from '@/lib/motion';
import { CountUp } from './CountUp';
import { lookupName, useEvents, useLookups, type Tile } from './data';
import { useDateFormat } from './FleetGrid';
import { EventList } from './Timeline';

const VIEW_KEY = 'fh.vehicleView';
const DETAIL_VIEWS = ['side', 'iso'] as const;
type DetailView = (typeof DETAIL_VIEWS)[number];
const RECORDS = [
  ['service', Wrench],
  ['malfunctions', TriangleAlert],
  ['fluids', Droplet],
  ['fuel', Fuel],
  ['movements', ArrowLeftRight],
  ['inspections', ClipboardCheck],
  ['ownership', ShieldCheck],
  ['documents', ReceiptText],
  ['quotes', FileText],
  ['notes', StickyNote],
] as const;

// Timeline of the transition, in seconds (SPEC 5.2: all of it within 1.2 s).
const T = { fly: 0.5, tilt: 0.45, toSide: 0.78, panels: 0.5, flatten: 0.4, flyBack: 0.45 };
const EASE = [0.22, 1, 0.36, 1] as const;

function savedView(): DetailView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'iso' ? 'iso' : 'side';
  } catch {
    return 'side';
  }
}

function heroSize() {
  return Math.round(Math.min(340, Math.max(220, window.innerWidth - 120)));
}

interface Props {
  serial: string;
  tile: Tile | undefined;
  loading: boolean;
  returning: boolean;
  /** Fly in from the grid tile (false for a deep link). */
  fromDashboard: boolean;
  onReturnStart: () => void;
  onClosed: () => void;
}

/**
 * The vehicle's page on the shared stage. Phase 3 fills in the panels; Phase 2 owns
 * the transition: the drawing flies from its tile, tilts, turns to its side profile,
 * the panels arrive, and Back plays it all in reverse.
 */
export function VehicleStage({
  serial,
  tile,
  loading,
  returning,
  fromDashboard,
  onReturnStart,
  onClosed,
}: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const highlightId = params.get('event');
  const { data: lookups } = useLookups();
  const formatDate = useDateFormat();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const heroRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<DetailView>(savedView);
  const [reduced] = useState(prefersReducedMotion);
  const [pose, setPose] = useState<HeroPose>(() => (reduced ? view : 'flat'));
  const [size] = useState(heroSize);
  const [now] = useState(Date.now);
  const timers = useRef<number[]>([]);
  const rtl = i18n.dir() === 'rtl';
  const events = useEvents({ vehicle: serial });

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
    const start = fromDashboard && !reduced ? offsetToTile() : null;
    if (reduced) {
      void animate(hero, { opacity: [0, 1] }, { duration: 0.2 });
    } else {
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
      later(T.fly - 0.05, () => setPose('iso'));
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
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
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Private mode: remembered for this visit only.
    }
  };

  const panel = (from: 'top' | 'side' | 'bottom', delay: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: {
            opacity: 0,
            x: from === 'side' ? (rtl ? -40 : 40) : 0,
            y: from === 'top' ? -24 : from === 'bottom' ? 32 : 0,
          },
          animate: { opacity: 1, x: 0, y: 0 },
          transition: { duration: 0.4, ease: EASE, delay },
        };

  const headerMotion = panel('top', T.panels);
  const toggleMotion = panel('bottom', T.panels);
  const asideMotion = panel('side', T.panels + 0.05);
  const recordMotion = (i: number) => panel('bottom', T.panels + 0.1 + i * 0.03);

  const typeName =
    tile &&
    lookupName(
      lookups?.vehicleTypes.find((v) => v.code === tile.type),
      i18n.language,
    );
  const location =
    tile &&
    lookupName(
      lookups?.locations.find((l) => l.code === tile.location),
      i18n.language,
    );
  const department =
    tile &&
    lookupName(
      lookups?.departments.find((d) => d.code === tile.department),
      i18n.language,
    );
  const daysToService = tile?.nextServiceDate
    ? Math.ceil((Date.parse(tile.nextServiceDate) - now) / 86_400_000)
    : null;

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
      <div className="mx-auto grid max-w-[1600px] gap-4 px-2 pt-2 sm:px-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <motion.header data-panel {...headerMotion} className="glass p-4">
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
                  <StatusBadge status={tile.status} />
                </>
              )}
            </div>
            {tile && (
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-muted text-xs">{t('vehicle.serial')}</dt>
                  <dd className="num text-2xl font-medium">
                    <bdi dir="ltr">{tile.serial}</bdi>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('dashboard.location')}</dt>
                  <dd className="text-sm">{location ?? t('dashboard.notSet')}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('vehicle.department')}</dt>
                  <dd className="text-sm">{department ?? t('dashboard.notSet')}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('vehicle.daysToService')}</dt>
                  <dd
                    className="num text-xl"
                    title={tile.nextServiceDate ? formatDate(tile.nextServiceDate) : undefined}
                  >
                    {daysToService === null ? (
                      t('dashboard.notSet')
                    ) : (
                      <CountUp value={daysToService} delay={T.panels} />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('dashboard.openIssues')}</dt>
                  <dd className={cn('num text-xl', tile.openIssues > 0 && 'text-warn')}>
                    <CountUp value={tile.openIssues} delay={T.panels} />
                  </dd>
                </div>
              </dl>
            )}
          </motion.header>

          <div className="relative grid place-items-center py-2">
            {tile ? (
              <div
                ref={heroRef}
                style={{ opacity: fromDashboard && !reduced ? 0 : undefined }}
                data-hero
              >
                <HeroVisual
                  type={tile.type}
                  status={tile.status}
                  pose={returning ? 'flat' : pose}
                  size={size}
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
                className="border-border bg-surface absolute end-0 top-2 flex rounded-lg border p-0.5 text-xs"
              >
                {DETAIL_VIEWS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => chooseView(v)}
                    className={cn(
                      'rounded-md px-2.5 py-1',
                      view === v ? 'bg-accent/15 text-accent' : 'text-muted',
                    )}
                  >
                    {t(v === 'side' ? 'vehicle.sideView' : 'vehicle.isoView')}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {tile && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {RECORDS.map(([key, Icon], i) => (
                <motion.li key={key} data-panel {...recordMotion(i)}>
                  <button
                    type="button"
                    disabled
                    title={t('topbar.comingSoon')}
                    className="glass text-muted flex h-full w-full items-center gap-2 p-3 text-start text-xs disabled:cursor-not-allowed"
                  >
                    <Icon aria-hidden className="text-accent size-4 shrink-0" />
                    {t(`vehicle.records.${key}`)}
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        {tile && (
          <motion.aside
            data-panel
            {...asideMotion}
            aria-labelledby="activity-title"
            className="glass flex max-h-[calc(100dvh-10rem)] min-h-0 flex-col p-3 lg:sticky lg:top-0"
          >
            <h2 id="activity-title" className="mb-2 text-sm font-semibold">
              {t('vehicle.activity')}
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {events.isPending ? (
                <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
              ) : (
                <EventList
                  pages={events.data?.pages ?? []}
                  highlightId={highlightId}
                  linkable={false}
                />
              )}
              {events.data && events.data.pages[0]?.items.length === 0 && (
                <p className="text-muted py-8 text-center text-sm">{t('vehicle.noActivity')}</p>
              )}
            </div>
          </motion.aside>
        )}
      </div>
    </div>
  );
}
