import { useEffect, useState } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboard, useLookups } from './data';
import { FleetGrid } from './FleetGrid';
import { HoverProvider } from './hover';
import { KpiStrip } from './KpiStrip';
import { LinkLine } from './LinkLine';
import { Timeline } from './Timeline';
import { VehicleStage } from './VehicleStage';

type Phase = 'home' | 'open' | 'returning';

/**
 * Dashboard and vehicle page in one persistent layout (SPEC 5.2). Both routes render
 * this component, so the grid, and the vehicle flying out of it, never unmount.
 */
export function FleetStage() {
  const { t, i18n } = useTranslation();
  const routeSerial = useMatch('/vehicles/:serial')?.params.serial ?? null;
  const location = useLocation();
  const state = location.state as { fromDashboard?: boolean; slide?: 1 | -1 } | null;
  const fromDashboard = state?.fromDashboard === true;
  const slideFrom = state?.slide ?? null;
  const dashboard = useDashboard();
  useLookups();

  const [active, setActive] = useState(routeSerial);
  const [phase, setPhase] = useState<Phase>(routeSerial ? 'open' : 'home');
  const [tilesBack, setTilesBack] = useState(false);
  const [seenRoute, setSeenRoute] = useState(routeSerial);

  // Follow the route (button, Esc, swipe and browser Back all just change it).
  if (seenRoute !== routeSerial) {
    setSeenRoute(routeSerial);
    if (routeSerial) {
      setActive(routeSerial);
      setPhase('open');
      setTilesBack(false);
    } else if (active) {
      setPhase('returning');
    }
  }

  useEffect(() => {
    if (!routeSerial) document.title = `${t('nav.dashboard')} · ${t('app.name')}`;
  }, [routeSerial, t]);

  // The stage scrolls on its own; keep the page underneath still.
  useEffect(() => {
    if (phase !== 'open') return;
    const html = document.documentElement;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = '';
    };
  }, [phase]);

  const away = phase === 'open' || (phase === 'returning' && !tilesBack);
  const towardStart = i18n.dir() === 'rtl' ? '110%' : '-110%';
  const slide = {
    initial: false as const,
    animate: away ? { x: towardStart, opacity: 0 } : { x: 0, opacity: 1 },
    transition: away
      ? { duration: 0.4, ease: [0.4, 0, 1, 1] as const }
      : { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  };

  const closed = () => {
    const serial = active;
    setActive(null);
    setPhase('home');
    setTilesBack(false);
    if (serial) {
      document
        .querySelector<HTMLElement>(`[data-tile="${CSS.escape(serial)}"]`)
        ?.focus({ preventScroll: true });
    }
  };

  let home;
  if (dashboard.isPending) {
    home = (
      <div className="text-muted grid min-h-[50vh] place-items-center" role="status">
        <Loader2 aria-hidden className="size-6 animate-spin" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  } else if (dashboard.isError) {
    home = (
      <div className="glass grid min-h-[40vh] place-items-center gap-3 p-8 text-center">
        <p>{t('dashboard.error')}</p>
        <Button variant="outline" size="sm" onClick={() => void dashboard.refetch()}>
          {t('dashboard.retry')}
        </Button>
      </div>
    );
  } else {
    const data = dashboard.data;
    home = (
      <div
        className="dash-layout grid gap-3 lg:gap-4"
        inert={phase === 'open'}
        aria-hidden={phase === 'open' || undefined}
      >
        <motion.div {...slide} className="[grid-area:kpi]">
          <h1 className="sr-only">{t('nav.dashboard')}</h1>
          <KpiStrip kpis={data.kpis} />
        </motion.div>
        <motion.div {...slide} className="flex min-h-0 flex-col [grid-area:timeline]">
          <Timeline first={data.recent} />
        </motion.div>
        <div className="min-w-0 [grid-area:grid]">
          <FleetGrid tiles={data.tiles} activeSerial={active} away={away} />
        </div>
      </div>
    );
  }

  return (
    <HoverProvider>
      <div className="relative">
        {home}
        {active && (
          <VehicleStage
            key={active}
            serial={active}
            tile={dashboard.data?.tiles.find((v) => v.serial === active)}
            tiles={dashboard.data?.tiles ?? []}
            slide={phase === 'open' ? slideFrom : null}
            loading={dashboard.isPending}
            returning={phase === 'returning'}
            fromDashboard={fromDashboard || phase === 'returning'}
            onReturnStart={() => setTilesBack(true)}
            onClosed={closed}
          />
        )}
        {phase === 'home' && <LinkLine />}
        <Outlet />
      </div>
    </HoverProvider>
  );
}
