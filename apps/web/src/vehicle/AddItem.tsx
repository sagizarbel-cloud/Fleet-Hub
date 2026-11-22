import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, PackagePlus, Plus } from 'lucide-react';
import { hasRole } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { isolate } from '@/lib/bidi';
import { ItemForm } from '@/money/ItemForm';
import { useItemAction, useUnassignedItems } from './data';

/**
 * Pick a free item from the yard and put it on this vehicle, or start a new one ("New item…").
 * Used inline above the vehicle's items table and inside the drawing's "Add tool" sheet.
 */
export function ItemChooser({
  serial,
  onDone,
  onNew,
}: {
  serial: string;
  onDone: () => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState('');
  const free = useUnassignedItems(true);
  const action = useItemAction(serial);
  const assign = () => {
    if (!choice) return;
    action.mutate({ id: choice, action: 'assign' }, { onSuccess: onDone });
  };
  return (
    <div className="space-y-2" data-testid="item-chooser">
      <div className="flex flex-wrap items-center gap-2">
        {free.isPending ? (
          <Loader2 aria-hidden className="text-muted size-4 animate-spin" />
        ) : free.data?.items.length ? (
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label={t('vehicle.items.choose')}
            className="border-border-strong bg-surface-strong h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
            data-testid="item-choice"
          >
            <option value="">{t('vehicle.items.choose')}</option>
            {free.data.items.map((item) => (
              <option key={item.id} value={item.id}>
                {[item.name, item.model, item.serial].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-muted min-w-0 flex-1 text-sm">{t('vehicle.items.noneFree')}</p>
        )}
        <Button size="sm" onClick={assign} disabled={!choice || action.isPending}>
          {t('vehicle.items.assign')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onNew} data-testid="item-new">
          <Plus aria-hidden className="size-3.5" />
          {t('vehicle.items.new')}
        </Button>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={onDone}>
          {t('vehicle.items.cancel')}
        </Button>
      </div>
      {action.isError && (
        <p role="alert" className="text-bad text-xs">
          {t('vehicle.items.failed')}
        </p>
      )}
    </div>
  );
}

/** The new-item form; once saved, the item goes straight onto this vehicle. */
export function NewItemForVehicle({
  serial,
  reduced,
  onClose,
}: {
  serial: string;
  reduced: boolean;
  onClose: () => void;
}) {
  const action = useItemAction(serial);
  return (
    <ItemForm
      reduced={reduced}
      onClose={(saved) => {
        if (saved) action.mutate({ id: saved.id, action: 'assign' });
        onClose();
      }}
    />
  );
}

/**
 * "Add tool" on the vehicle drawing (Sagi, 2026-11-15): put a tool or accessory on this vehicle
 * without scrolling down to its items, or create one on the spot. Editors and admins only.
 */
export function AddToolButton({ serial, reduced }: { serial: string; reduced: boolean }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const [open, setOpen] = useState<null | 'choose' | 'new'>(null);
  if (!user || !hasRole(user.role, 'EDITOR')) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen('choose')}
        className="border-border bg-surface hover:text-text text-muted flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium"
        aria-label={t('vehicle.items.addTool')}
        title={t('vehicle.items.addTool')}
        data-testid="add-tool"
      >
        <PackagePlus aria-hidden className="size-3.5" />
        {/* Icon only on phones, where it shares the row with the tool and view switches. */}
        <span aria-hidden className="hidden sm:inline">
          {t('vehicle.items.addTool')}
        </span>
      </button>
      {open === 'choose' && (
        <Sheet
          title={t('vehicle.items.addToolTitle', { serial: isolate(serial) })}
          onClose={() => setOpen(null)}
          reduced={reduced}
        >
          <p className="text-muted mb-3 text-sm">{t('vehicle.items.addToolHint')}</p>
          <ItemChooser serial={serial} onDone={() => setOpen(null)} onNew={() => setOpen('new')} />
        </Sheet>
      )}
      {open === 'new' && (
        <NewItemForVehicle serial={serial} reduced={reduced} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
