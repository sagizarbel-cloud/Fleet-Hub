import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Rows3, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export const CONTROL =
  'border-border-strong bg-surface h-8 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

type Filters = Record<string, string | undefined>;

/**
 * Filters kept in the URL (so a filtered list can be shared and Back works), or in local
 * state when the list sits inside another page (a vehicle's tab).
 */
export function useFilters<F extends Filters>(keys: readonly (keyof F & string)[], inUrl: boolean) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<F>({} as F);
  const fromUrl = useMemo(() => {
    const out: Filters = {};
    for (const k of keys) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    return out as F;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const filters = inUrl ? fromUrl : local;
  const set = useCallback(
    (patch: Partial<F>) => {
      if (!inUrl) {
        setLocal((f) => ({ ...f, ...patch }));
        return;
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v as string);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [inUrl, setParams],
  );
  return [filters, set] as const;
}

export function SearchBox({
  value,
  onChange,
  label,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  testId?: string;
}) {
  return (
    <label className="relative min-w-40 flex-1 sm:max-w-64">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        className="text-muted pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className={cn(CONTROL, 'w-full ps-7')}
        data-testid={testId}
      />
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CONTROL, value && 'border-accent')}
      data-testid={testId}
    >
      <option value="">{t('records.filterAll', { name: label })}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const VIEW_KEY = 'fh.money.view';
const MODES = [
  ['grid', LayoutGrid],
  ['table', Rows3],
] as const;

/** Grid or table, remembered per user on this device. */
export function useViewMode(scope: string): ['grid' | 'table', (v: 'grid' | 'table') => void] {
  const key = `${VIEW_KEY}.${scope}`;
  const [mode, setMode] = useState<'grid' | 'table'>(() => {
    try {
      return localStorage.getItem(key) === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const set = (v: 'grid' | 'table') => {
    setMode(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // Private windows: the choice just isn't remembered.
    }
  };
  return [mode, set];
}

export function ViewToggle({
  mode,
  onChange,
}: {
  mode: 'grid' | 'table';
  onChange: (v: 'grid' | 'table') => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('money.view')}
      className="border-border-strong flex rounded-md border"
    >
      {MODES.map(([m, Icon]) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          title={t(`money.${m}`)}
          className={cn(
            'grid h-8 w-8 place-items-center first:rounded-s-md last:rounded-e-md',
            mode === m ? 'bg-accent/15 text-accent-ink' : 'text-muted hover:text-text',
          )}
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{t(`money.${m}`)}</span>
        </button>
      ))}
    </div>
  );
}

export function Badge({
  tone,
  children,
  testId,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'muted' | 'accent';
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium whitespace-nowrap',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'bad' && 'bg-bad/15 text-bad',
        tone === 'muted' && 'bg-border text-muted',
        tone === 'accent' && 'bg-accent/20 text-accent-ink',
      )}
    >
      {children}
    </span>
  );
}

/** Page heading with the area's actions beside it. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 id="area-title" className="me-auto text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h1>
      {children}
    </div>
  );
}

/** A Hebrew or English month label, e.g. "Oct 2026". */
export function monthLabel(month: string, lang: string) {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(y!, m! - 1, 15)));
}
