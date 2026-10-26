import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, ChevronDown, Pencil, Save, Star, Trash2 } from 'lucide-react';
import type { FleetViewSettings } from '@fleet-hub/shared';
import { Popover } from '@/components/Popover';
import { cn } from '@/lib/cn';
import { usePreferences, useSavePreferences } from '@/vehicle/data';
import { useDeleteView, useSaveView, useSavedViews, type SavedView } from './data';

const MENU_ITEM =
  'hover:bg-border/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm disabled:opacity-50';
const INPUT =
  'border-border-strong bg-surface h-8 min-w-0 flex-1 rounded-md border px-2 text-sm focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]';

type Mode = { kind: 'list' } | { kind: 'name'; editing: SavedView | null } | { kind: 'delete' };

/**
 * Saved views (SPEC 5.4): shared by everyone. Anyone can save one; its creator or an admin
 * can rename, update or delete it. Each user picks the view the table opens with.
 */
export function ViewsMenu({
  view,
  settings,
  modified,
  onPick,
}: {
  view: SavedView | null;
  settings: FleetViewSettings;
  modified: boolean;
  onPick: (view: SavedView | null) => void;
}) {
  const { t } = useTranslation();
  const { data: views = [] } = useSavedViews();
  const prefs = usePreferences();
  const savePrefs = useSavePreferences();
  const save = useSaveView();
  const remove = useDeleteView();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const defaultId = prefs.data?.fleetViewId ?? null;
  const current = view?.name ?? t('fleet.views.all');

  const submitName = (close: () => void) => {
    if (mode.kind !== 'name' || !name.trim()) return;
    const editing = mode.editing;
    setFailed(false);
    save.mutate(
      editing
        ? { id: editing.id, name: name.trim(), settings: editing.settings }
        : { name: name.trim(), settings },
      {
        onSuccess: (saved) => {
          setMode({ kind: 'list' });
          if (!editing) onPick(saved);
          close();
        },
        onError: () => setFailed(true),
      },
    );
  };

  const row = (v: SavedView | null, close: () => void) => {
    const id = v?.id ?? null;
    return (
      <li key={id ?? 'all'} className="flex items-center gap-1">
        <button
          type="button"
          className={cn(MENU_ITEM, view?.id === v?.id && 'bg-accent/15')}
          aria-current={view?.id === v?.id || undefined}
          onClick={() => {
            onPick(v);
            close();
          }}
          data-testid="view-option"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{v?.name ?? t('fleet.views.all')}</span>
            {v?.createdBy && (
              <span className="text-muted block truncate text-xs">
                {t('fleet.views.by', { name: v.createdBy })}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-md',
            defaultId === id ? 'text-accent-ink' : 'text-muted hover:text-text',
          )}
          aria-pressed={defaultId === id}
          aria-label={t('fleet.views.makeDefault', { name: v?.name ?? t('fleet.views.all') })}
          title={t('fleet.views.makeDefault', { name: v?.name ?? t('fleet.views.all') })}
          onClick={() => savePrefs.mutate({ fleetViewId: id })}
        >
          <Star aria-hidden className={cn('size-4', defaultId === id && 'fill-current')} />
        </button>
      </li>
    );
  };

  return (
    <Popover
      label={t('fleet.views.label')}
      align="start"
      // On phones the panel spans the toolbar row rather than hanging off the small trigger.
      className="static sm:relative"
      panelClassName="w-[min(20rem,calc(100vw-3rem))]"
      trigger={
        <span className="inline-flex max-w-52 items-center gap-1.5" data-testid="views-menu">
          <Bookmark aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{current}</span>
          {modified && <span className="text-muted shrink-0">{t('fleet.views.changed')}</span>}
          <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        </span>
      }
    >
      {(close) => {
        if (mode.kind === 'name') {
          return (
            <form
              className="space-y-2 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                submitName(close);
              }}
            >
              <label className="block space-y-1 text-xs">
                <span className="text-muted">{t('fleet.views.name')}</span>
                <span className="flex gap-2">
                  <input
                    autoFocus
                    className={INPUT}
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="view-name"
                  />
                </span>
              </label>
              {failed && (
                <p role="alert" className="text-bad text-xs">
                  {t('records.error.save')}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={cn(MENU_ITEM, 'w-auto')}
                  onClick={() => setMode({ kind: 'list' })}
                >
                  {t('vehicle.items.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || save.isPending}
                  className="bg-accent text-accent-contrast h-8 rounded-md px-3 text-sm font-medium disabled:opacity-50"
                >
                  {t('fleet.views.save')}
                </button>
              </div>
            </form>
          );
        }
        if (mode.kind === 'delete' && view) {
          return (
            <div className="space-y-2 p-1">
              <p className="text-sm">{t('fleet.views.confirmDelete', { name: view.name })}</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={cn(MENU_ITEM, 'w-auto')}
                  onClick={() => setMode({ kind: 'list' })}
                >
                  {t('vehicle.items.cancel')}
                </button>
                <button
                  type="button"
                  className="border-bad/50 bg-bad/10 text-bad h-8 rounded-md border px-3 text-sm font-medium"
                  data-testid="view-delete-confirm"
                  onClick={() =>
                    remove.mutate(view.id, {
                      onSuccess: () => {
                        setMode({ kind: 'list' });
                        onPick(null);
                        close();
                      },
                    })
                  }
                >
                  {t('fleet.views.delete')}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-1">
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {[null, ...views].map((v) => row(v, close))}
            </ul>
            <p className="text-muted px-2 text-xs">{t('fleet.views.defaultHint')}</p>
            <div className="border-border space-y-0.5 border-t pt-1">
              {view?.canEdit && modified && (
                <button
                  type="button"
                  className={MENU_ITEM}
                  data-testid="view-update"
                  onClick={() =>
                    save.mutate(
                      { id: view.id, name: view.name, settings },
                      { onSuccess: (saved) => (onPick(saved), close()) },
                    )
                  }
                >
                  <Save aria-hidden className="size-4" />
                  {t('fleet.views.update', { name: view.name })}
                </button>
              )}
              <button
                type="button"
                className={MENU_ITEM}
                data-testid="view-save-new"
                onClick={() => {
                  setName('');
                  setFailed(false);
                  setMode({ kind: 'name', editing: null });
                }}
              >
                <Bookmark aria-hidden className="size-4" />
                {t('fleet.views.saveNew')}
              </button>
              {view?.canEdit && (
                <>
                  <button
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => {
                      setName(view.name);
                      setFailed(false);
                      setMode({ kind: 'name', editing: view });
                    }}
                  >
                    <Pencil aria-hidden className="size-4" />
                    {t('fleet.views.rename')}
                  </button>
                  <button
                    type="button"
                    className={cn(MENU_ITEM, 'text-bad')}
                    data-testid="view-delete"
                    onClick={() => setMode({ kind: 'delete' })}
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {t('fleet.views.delete')}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      }}
    </Popover>
  );
}
