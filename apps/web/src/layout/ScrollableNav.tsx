import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { AREA_ROUTES, AREAS } from './nav';

/**
 * Area tabs. On narrow screens they scroll sideways; a fade and chevron on whichever
 * edge has more tabs shows that, and the active tab is always scrolled into view.
 */
export function ScrollableNav() {
  const { t, i18n } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);
  const location = useLocation();
  const [more, setMore] = useState({ start: false, end: false });
  const rtl = i18n.dir() === 'rtl';

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // scrollLeft runs negative in RTL; its magnitude is the distance from the start edge.
    const pos = Math.abs(el.scrollLeft);
    setMore({ start: pos > 2, end: pos < max - 2 });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, rtl]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [location.pathname, rtl]);

  function nudge(toward: 'start' | 'end') {
    const el = listRef.current;
    if (!el) return;
    const sign = (toward === 'end' ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: sign * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  const StartIcon = rtl ? ChevronRight : ChevronLeft;
  const EndIcon = rtl ? ChevronLeft : ChevronRight;
  const edge =
    'from-surface-strong from-45% absolute inset-y-0 z-10 flex w-14 items-center transition-opacity duration-150';

  return (
    <nav aria-label={t('a11y.mainNav')} className="border-border relative border-t">
      <ul
        ref={listRef}
        onScroll={measure}
        className="flex scroll-px-12 gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden"
      >
        {AREAS.map((area) => {
          const { path, icon: Icon } = AREA_ROUTES[area];
          return (
            <li key={area} className="shrink-0">
              <NavLink
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-contrast'
                      : 'text-muted hover:text-text hover:bg-border',
                  )
                }
              >
                <Icon aria-hidden className="size-4" />
                {t(`nav.${area}`)}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => nudge('start')}
        className={cn(
          edge,
          'start-0 justify-start rounded-bs-xl ps-1 to-transparent',
          rtl ? 'bg-linear-to-l' : 'bg-linear-to-r',
          more.start ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <StartIcon className="text-text size-5" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => nudge('end')}
        data-testid="nav-more-end"
        className={cn(
          edge,
          'end-0 justify-end rounded-be-xl pe-1 to-transparent',
          rtl ? 'bg-linear-to-r' : 'bg-linear-to-l',
          more.end ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <EndIcon className="text-text size-5" />
      </button>
    </nav>
  );
}
