import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { VEHICLE_TYPE_CODES } from '@fleet-hub/shared';
import { Popover } from '@/components/Popover';
import type { Tile } from '@/fleet/data';

export type SlideDirection = 1 | -1;

/** The dashboard grid's order: by type (as in SPEC A4), then by serial. */
export function gridOrder(tiles: Tile[]) {
  const rank = (code: string) => {
    const i = VEHICLE_TYPE_CODES.indexOf(code as (typeof VEHICLE_TYPE_CODES)[number]);
    return i === -1 ? VEHICLE_TYPE_CODES.length : i;
  };
  return [...tiles].sort((a, b) => rank(a.type) - rank(b.type) || a.serial.localeCompare(b.serial));
}

function isTyping(target: EventTarget | null) {
  return (
    (target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))) ||
    // A form sheet is open over the page.
    !!document.querySelector('[aria-modal="true"]')
  );
}

/** Prev / Next (buttons and arrow keys, mirrored in Hebrew) and a jump-to-vehicle search. */
export function VehicleNav({ serial, tiles }: { serial: string; tiles: Tile[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const rtl = i18n.dir() === 'rtl';
  const order = useMemo(() => gridOrder(tiles), [tiles]);
  const index = order.findIndex((v) => v.serial === serial);
  const [query, setQuery] = useState('');
  // Where the last press is taking us. Quick presses arrive before the page has moved, so each one
  // steps on from there rather than from the vehicle still on screen.
  const heading = useRef(serial);
  useEffect(() => {
    heading.current = serial;
  }, [serial]);

  const go = (to: string, slide: SlideDirection) => {
    if (to === heading.current) return;
    heading.current = to;
    const state = (location.state as Record<string, unknown> | null) ?? {};
    // Replace, so Back still leaves the vehicle pages in one step.
    navigate(`/vehicles/${encodeURIComponent(to)}`, { replace: true, state: { ...state, slide } });
  };
  const step = (by: SlideDirection) => {
    const from = order.findIndex((v) => v.serial === heading.current);
    if (from === -1 || order.length < 2) return;
    go(order[(from + by + order.length) % order.length]!.serial, by);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // The next vehicle is toward the reading direction's end.
      const forward = (e.key === 'ArrowRight') !== rtl;
      e.preventDefault();
      step(forward ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const q = query.trim().toLowerCase();
  const matches = q
    ? order.filter((v) =>
        [v.serial, v.licenseNo ?? '', v.make, v.model].some((s) => s.toLowerCase().includes(q)),
      )
    : order;
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const navButton =
    'border-border hover:border-border-strong text-muted hover:text-text grid size-8 place-items-center rounded-lg border disabled:opacity-40';

  return (
    <div className="flex items-center gap-1.5" data-testid="vehicle-nav">
      <button
        type="button"
        className={navButton}
        onClick={() => step(-1)}
        disabled={order.length < 2}
        aria-label={t('vehicle.nav.prev')}
        title={t('vehicle.nav.prev')}
      >
        <Prev aria-hidden className="size-4" />
      </button>
      <span className="num text-muted min-w-10 text-center text-xs">
        {index === -1 ? '' : t('vehicle.nav.position', { n: index + 1, total: order.length })}
      </span>
      <button
        type="button"
        className={navButton}
        onClick={() => step(1)}
        disabled={order.length < 2}
        aria-label={t('vehicle.nav.next')}
        title={t('vehicle.nav.next')}
      >
        <Next aria-hidden className="size-4" />
      </button>
      <Popover
        label={t('vehicle.nav.jump')}
        trigger={<Search aria-hidden className="size-3.5" />}
        panelClassName="w-64"
      >
        {(close) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const first = matches[0];
              if (first) {
                close();
                go(first.serial, 1);
              }
            }}
          >
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('vehicle.nav.jumpPlaceholder')}
              aria-label={t('vehicle.nav.jump')}
              className="border-border-strong bg-surface-strong focus:border-accent mb-1.5 h-8 w-full rounded-md border px-2 text-sm outline-none"
            />
            <ul className="max-h-64 overflow-y-auto">
              {matches.map((v) => (
                <li key={v.serial}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      const to = order.findIndex((o) => o.serial === v.serial);
                      go(v.serial, to < index ? -1 : 1);
                    }}
                    aria-current={v.serial === serial || undefined}
                    className="hover:bg-border aria-[current]:bg-accent/15 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start text-sm"
                  >
                    <bdi dir="ltr" className="num w-16 shrink-0 text-xs">
                      {v.serial}
                    </bdi>
                    <span className="truncate">
                      {v.make} {v.model}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="text-muted px-1.5 py-2 text-xs">{t('vehicle.nav.noMatch')}</li>
              )}
            </ul>
          </form>
        )}
      </Popover>
    </div>
  );
}
