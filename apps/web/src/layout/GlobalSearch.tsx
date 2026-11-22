import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import type { SearchHit } from '@fleet-hub/shared';
import { lookupName, useLookups } from '@/fleet/data';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { recordParam } from '@/vehicle/records/recordLink';
import { AREA_ROUTES } from './nav';

const GROUPS = ['vehicle', 'record', 'item'] as const;

/** Where a hit leads: the vehicle, the record's report on its vehicle page, or the item in Equipment. */
export function hitPath(h: SearchHit): string {
  const v = h.serial ? `/vehicles/${encodeURIComponent(h.serial)}` : null;
  if (h.group === 'vehicle' && v) return v;
  if (h.group === 'record' && v && h.kind)
    return `${v}?record=${encodeURIComponent(recordParam(h.kind as never, h.id))}`;
  return `${AREA_ROUTES.equipment.path}?q=${encodeURIComponent(h.text.replace(/…/g, '').trim())}`;
}

function useDebounced(value: string, ms: number) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

/**
 * The top bar's search (Sagi, 2026-11-22): serial, VIN, plate and any other text field of the
 * vehicles, their records and the items, with the vehicle serial on every hit. Arrow keys move,
 * Enter opens, Esc clears. On phones it opens from an icon as a row under the bar.
 */
export function GlobalSearch({
  phoneOpen,
  onPhoneClose,
}: {
  /** On phones the box is hidden until the top bar's search icon opens it. */
  phoneOpen: boolean;
  onPhoneClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: lookups } = useLookups();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const closePhone = useRef(onPhoneClose);
  useEffect(() => {
    closePhone.current = onPhoneClose;
  });
  const q = useDebounced(text.trim(), 200);
  const enabled = q.length >= 2;
  const search = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<{ hits: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`),
    enabled,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
  const hits = useMemo(() => (enabled ? (search.data?.hits ?? []) : []), [enabled, search.data]);

  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        closePhone.current();
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  useEffect(() => {
    if (phoneOpen) input.current?.focus();
  }, [phoneOpen]);

  const go = (h: SearchHit | undefined) => {
    if (!h) return;
    navigate(hitPath(h));
    setText('');
    setOpen(false);
    onPhoneClose();
    input.current?.blur();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // An exact serial goes straight to its vehicle.
      const exact = hits.find(
        (h) => h.group === 'vehicle' && h.serial?.toLowerCase() === text.trim().toLowerCase(),
      );
      go(exact ?? hits[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (text) setText('');
      else {
        setOpen(false);
        onPhoneClose();
      }
    }
  };

  const typeName = (code: string | null) =>
    code
      ? lookupName(
          lookups?.vehicleTypes.find((x) => x.code === code),
          i18n.language,
        )
      : null;
  const label = (h: SearchHit) =>
    h.group === 'vehicle'
      ? typeName(h.type)
      : h.group === 'record'
        ? t(`vehicle.records.one.${h.kind as 'notes'}`)
        : t(`equipment.kinds.${(h.kind ?? 'other') as 'other'}`);

  const showList = open && enabled;
  let n = -1;
  return (
    <div
      ref={root}
      className={cn(
        'ms-2 max-w-md flex-1 md:block',
        phoneOpen
          ? 'fh-search-phone absolute inset-x-2 top-full z-50 mt-1 block md:static md:mt-0'
          : 'hidden',
      )}
      data-testid="global-search"
    >
      <div className="relative">
        <label className="relative block">
          <span className="sr-only">{t('topbar.search')}</span>
          <Search
            aria-hidden
            className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={t('topbar.search')}
            autoComplete="off"
            className="border-border bg-surface-strong/40 placeholder:text-muted h-9 w-full rounded-lg border ps-9 pe-8 text-sm"
            data-testid="search-input"
          />
          {search.isFetching && enabled && (
            <Loader2
              aria-hidden
              className="text-muted absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin"
            />
          )}
        </label>
        {showList && (
          <div
            id={listId}
            role="listbox"
            aria-label={t('search.results')}
            className="fh-search-results border-border bg-surface text-text absolute inset-x-0 top-full z-50 mt-1 max-h-[min(70dvh,28rem)] overflow-y-auto rounded-lg border p-1 shadow-lg"
            data-testid="search-results"
          >
            {hits.length === 0 ? (
              <p className="text-muted px-3 py-2 text-sm">
                {search.isPending ? t('search.searching') : t('search.none')}
              </p>
            ) : (
              GROUPS.map((g) => {
                const list = hits.filter((h) => h.group === g);
                if (!list.length) return null;
                return (
                  <div key={g} role="group" aria-label={t(`search.group.${g}`)}>
                    <p className="text-muted px-2 pt-2 pb-1 text-[11px] font-semibold uppercase">
                      {t(`search.group.${g}`)}
                    </p>
                    {list.map((h) => {
                      n += 1;
                      const i = n;
                      return (
                        <button
                          key={`${h.group}-${h.kind}-${h.id}-${h.field}`}
                          id={`${listId}-${i}`}
                          type="button"
                          role="option"
                          aria-selected={i === active}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(h)}
                          className={cn(
                            'flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-start text-sm',
                            i === active && 'bg-border',
                          )}
                          data-testid="search-hit"
                        >
                          <span className="num w-16 shrink-0 pt-0.5 text-xs font-semibold">
                            {h.serial ? <bdi dir="ltr">{h.serial}</bdi> : '—'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              <bdi>{h.text}</bdi>
                            </span>
                            <span className="text-muted block truncate text-xs">
                              {label(h)} · {t(`search.field.${h.field as 'serial'}`)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The phone's search icon; rendered by the top bar next to its other buttons. */
export function SearchPhoneButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('topbar.search')}
      title={t('topbar.search')}
      className="hover:bg-border grid size-8 place-items-center rounded-lg md:hidden"
      data-testid="search-open"
    >
      <Search aria-hidden className="size-4" />
    </button>
  );
}
