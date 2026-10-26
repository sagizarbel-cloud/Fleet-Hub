import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { EventType } from '@fleet-hub/shared';
import { useEvents } from '@/fleet/data';
import { EVENT_GROUP_KEYS, EVENT_GROUPS, type EventGroup } from '@/fleet/events';
import { Chip, EventList } from '@/fleet/Timeline';

/** How far back a linked event is looked for, in pages of 60 (about 1,200 events). */
const MAX_PAGES_FOR_HIGHLIGHT = 20;

/**
 * This vehicle's activity: filter chips, more events as you scroll, and an event linked from
 * the dashboard is paged back to and brought into view even when it is older than page one.
 */
export function Activity({
  serial,
  highlightId,
  reduced,
  revealDelayMs,
}: {
  serial: string;
  highlightId: string | null;
  reduced: boolean;
  revealDelayMs: number;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const types = useMemo(
    () => groups.flatMap((g) => EVENT_GROUPS[g].types as EventType[]),
    [groups],
  );
  const events = useEvents({ vehicle: serial, types });
  const pages = events.data?.pages ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const found = !!highlightId && pages.some((p) => p.items.some((e) => e.id === highlightId));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = events;

  // Load more when the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // A linked event older than what's loaded: keep paging back until it turns up.
  useEffect(() => {
    if (!highlightId || found || !hasNextPage || isFetchingNextPage) return;
    if (pages.length >= MAX_PAGES_FOR_HIGHLIGHT) return;
    void fetchNextPage();
  }, [highlightId, found, hasNextPage, isFetchingNextPage, pages.length, fetchNextPage]);

  // Once it's there, bring it into view (after the panels have arrived).
  useEffect(() => {
    if (!found || !highlightId) return;
    const id = window.setTimeout(() => {
      scroller.current
        ?.querySelector(`[data-event-id="${CSS.escape(highlightId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }, revealDelayMs);
    return () => clearTimeout(id);
  }, [found, highlightId, reduced, revealDelayMs]);

  const toggle = (g: EventGroup) =>
    setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  const empty = !events.isPending && pages.every((p) => p.items.length === 0);

  return (
    <>
      <h2 id="activity-title" className="mb-2 text-sm font-semibold">
        {t('vehicle.activity')}
      </h2>
      <div
        role="group"
        aria-label={t('dashboard.eventFilters')}
        className="mb-2 flex flex-wrap gap-1"
      >
        <Chip pressed={groups.length === 0} onClick={() => setGroups([])}>
          {t('dashboard.allEvents')}
        </Chip>
        {EVENT_GROUP_KEYS.map((g) => {
          const Icon = EVENT_GROUPS[g].icon;
          return (
            <Chip key={g} pressed={groups.includes(g)} onClick={() => toggle(g)}>
              <Icon aria-hidden className="size-3.5" />
              {t(`dashboard.group.${g}`)}
            </Chip>
          );
        })}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" data-scroll="activity">
        {events.isPending ? (
          <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
        ) : empty ? (
          <p className="text-muted py-8 text-center text-sm">
            {groups.length ? t('dashboard.noEvents') : t('vehicle.noActivity')}
          </p>
        ) : (
          <EventList pages={pages} highlightId={highlightId} linkable={false} showSerial={false} />
        )}
        <div ref={sentinel} aria-hidden className="h-px" />
        {isFetchingNextPage && (
          <Loader2 aria-hidden className="text-muted mx-auto my-3 size-4 animate-spin" />
        )}
      </div>
    </>
  );
}
