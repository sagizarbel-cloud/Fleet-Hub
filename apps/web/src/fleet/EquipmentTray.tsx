import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical } from 'lucide-react';
import { useItems } from '@/money/api';
import { ITEM_MIME } from '@/money/drag';
import { SearchBox } from '@/money/ui';
import { cn } from '@/lib/cn';

export interface PickedItem {
  id: string;
  name: string;
  /** Serial of the vehicle it is on now, or null in the yard. */
  from: string | null;
}

/**
 * Equipment on the dashboard (editors): drag an item onto a vehicle tile to assign it, or on a
 * phone tap the item and then the tile. Loaded only when opened.
 */
export default function EquipmentTray({
  picked,
  onPick,
}: {
  picked: PickedItem | null;
  onPick: (item: PickedItem | null) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const { data: items = [], isPending } = useItems({ q: q.trim() || undefined });

  return (
    <div className="border-border mt-3 space-y-2 border-t pt-3" data-testid="equipment-tray">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold">{t('tray.title')}</h3>
        <p className="text-muted me-auto text-xs">{t('tray.hint')}</p>
        <SearchBox label={t('equipment.search')} value={q} onChange={setQ} />
      </div>
      <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto p-0.5">
        {items.map((i) => {
          const item: PickedItem = { id: i.id, name: i.name, from: i.vehicle?.serial ?? null };
          const on = picked?.id === i.id;
          return (
            <li key={i.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ITEM_MIME, JSON.stringify(item));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onPick(on ? null : item)}
                aria-pressed={on}
                className={cn(
                  'border-border bg-surface inline-flex h-8 cursor-grab items-center gap-1.5 rounded-full border ps-1.5 pe-3 text-xs active:cursor-grabbing',
                  on ? 'border-accent ring-accent/40 ring-2' : 'hover:border-border-strong',
                )}
                data-testid="tray-item"
              >
                <GripVertical aria-hidden className="text-muted size-3.5" />
                <span dir="auto">{i.name}</span>
                <span className="text-muted">
                  {item.from ? (
                    <bdi dir="ltr" className="num">
                      {item.from}
                    </bdi>
                  ) : (
                    t('equipment.inYard')
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {!isPending && items.length === 0 && (
          <li className="text-muted text-xs">{t('equipment.empty')}</li>
        )}
      </ul>
    </div>
  );
}
