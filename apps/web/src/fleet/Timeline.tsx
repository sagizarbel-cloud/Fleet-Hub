import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { EventType } from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useEvents, useLookups, type EventPage, type FleetEvent } from './data';
import {
  EVENT_GROUP_KEYS,
  EVENT_GROUPS,
  dayKey,
  describeEvent,
  EVENT_ICON,
  type EventGroup,
} from './events';
import { useHover } from './hover';

function useDayLabel() {
  const { t, i18n } = useTranslation();
  return (key: string) => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (key === dayKey(today.toISOString())) return t('dashboard.today');
    if (key === dayKey(yesterday.toISOString())) return t('dashboard.yesterday');
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: y === today.getFullYear() ? undefined : 'numeric',
    }).format(new Date(y!, m! - 1, d));
  };
}

export function EventRow({
  event,
  onOpen,
  highlighted,
  linkable = true,
  showSerial = true,
}: {
  event: FleetEvent;
  onOpen?: () => void;
  highlighted?: boolean;
  linkable?: boolean;
  showSerial?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data: lookups } = useLookups();
  const hover = useHover();
  const Icon = EVENT_ICON[event.type];
  const text = describeEvent(t, event, lookups, i18n.language);
  const lit = highlighted || hover.serial === event.vehicle.serial;
  const time = new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.occurredAt));

  return (
    <li>
      <button
        type="button"
        data-event-id={event.id}
        data-event-serial={event.vehicle.serial}
        onClick={onOpen}
        onPointerEnter={
          linkable
            ? () => hover.setEvent({ id: event.id, serial: event.vehicle.serial })
            : undefined
        }
        onPointerLeave={linkable ? () => hover.setEvent(null) : undefined}
        onFocus={
          linkable
            ? () => hover.setEvent({ id: event.id, serial: event.vehicle.serial })
            : undefined
        }
        onBlur={linkable ? () => hover.setEvent(null) : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors',
          'hover:bg-accent/8 focus-visible:bg-accent/8',
          lit && 'bg-accent/10 ring-accent/40 ring-1',
        )}
      >
        <Icon aria-hidden className="text-muted size-4 shrink-0" />
        {showSerial && (
          <span className="num border-border-strong shrink-0 rounded-md border px-1.5 py-px text-xs">
            <bdi dir="ltr">{event.vehicle.serial}</bdi>
          </span>
        )}
        <span className="min-w-0 flex-1 truncate" title={text}>
          {text}
        </span>
        <time dateTime={event.occurredAt} className="num text-muted shrink-0 text-xs">
          {time}
        </time>
      </button>
    </li>
  );
}

/** Events grouped by local day, newest first. */
export function EventList({
  pages,
  onOpen,
  highlightId,
  linkable,
  showSerial,
}: {
  pages: EventPage[];
  onOpen?: (e: FleetEvent) => void;
  highlightId?: string | null;
  linkable?: boolean;
  showSerial?: boolean;
}) {
  const dayLabel = useDayLabel();
  const days = useMemo(() => {
    const groups: { key: string; items: FleetEvent[] }[] = [];
    for (const e of pages.flatMap((p) => p.items)) {
      const key = dayKey(e.occurredAt);
      const last = groups.at(-1);
      if (last?.key === key) last.items.push(e);
      else groups.push({ key, items: [e] });
    }
    return groups;
  }, [pages]);

  return (
    <>
      {days.map((day) => (
        <section key={day.key} aria-label={dayLabel(day.key)}>
          <h3 className="bg-surface-strong/90 text-muted sticky top-0 z-[1] px-2 py-1 text-xs font-medium backdrop-blur">
            {dayLabel(day.key)}
          </h3>
          <ul className="space-y-0.5">
            {day.items.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onOpen={onOpen ? () => onOpen(e) : undefined}
                highlighted={e.id === highlightId}
                linkable={linkable}
                showSerial={showSerial}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Fleet-wide timeline with filter chips per event group. */
export function Timeline({ first }: { first: EventPage }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const types = useMemo(
    () => groups.flatMap((g) => EVENT_GROUPS[g].types as EventType[]),
    [groups],
  );
  const events = useEvents({ types, first: groups.length ? undefined : first });
  const pages = events.data?.pages ?? [];
  const empty = !events.isPending && pages.every((p) => p.items.length === 0);

  const toggle = (g: EventGroup) =>
    setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  return (
    <section
      aria-labelledby="timeline-title"
      className="glass flex min-h-0 flex-col p-3"
      data-testid="timeline"
    >
      <h2 id="timeline-title" className="mb-2 text-sm font-semibold">
        {t('dashboard.recentActivity')}
      </h2>
      <div
        role="group"
        aria-label={t('dashboard.eventFilters')}
        className="mb-2 flex flex-wrap gap-1.5"
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
      <div
        className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 lg:max-h-[calc(100dvh-24rem)]"
        data-scroll="timeline"
      >
        {events.isPending ? (
          <Loader2 aria-hidden className="text-muted mx-auto my-8 size-5 animate-spin" />
        ) : empty ? (
          <p className="text-muted py-8 text-center text-sm">{t('dashboard.noEvents')}</p>
        ) : (
          <EventList
            pages={pages}
            onOpen={(e) =>
              navigate(`/vehicles/${encodeURIComponent(e.vehicle.serial)}?event=${e.id}`, {
                state: { fromDashboard: true },
              })
            }
          />
        )}
        {events.hasNextPage && (
          <div className="py-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={events.isFetchingNextPage}
              onClick={() => void events.fetchNextPage()}
            >
              {t('dashboard.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors',
        pressed
          ? 'border-accent bg-accent text-accent-contrast'
          : 'border-border text-muted hover:text-text hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}
