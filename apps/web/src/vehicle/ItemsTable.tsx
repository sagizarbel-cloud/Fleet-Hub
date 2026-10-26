import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Package, Plus, X } from 'lucide-react';
import { hasRole } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/fleet/FleetGrid';
import { useItemAction, useUnassignedItems, type VehicleDetail } from './data';

const DASH = '—';

/** Accessories and work tools on this vehicle, with Assign and Remove for editors and admins. */
export function ItemsTable({ vehicle }: { vehicle: VehicleDetail }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const formatDate = useDateFormat();
  const canEdit = !!user && hasRole(user.role, 'EDITOR');
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState('');
  const free = useUnassignedItems(canEdit && choosing);
  const action = useItemAction(vehicle.serial);

  const assign = () => {
    if (!choice) return;
    action.mutate(
      { id: choice, action: 'assign' },
      {
        onSuccess: () => {
          setChoice('');
          setChoosing(false);
        },
      },
    );
  };

  return (
    <section aria-labelledby="items-title" className="glass p-3" data-testid="items">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="items-title" className="me-auto flex items-center gap-2 text-sm font-semibold">
          <Package aria-hidden className="text-accent-ink size-4" />
          {t('vehicle.items.title')}
        </h2>
        {canEdit && !choosing && (
          <Button variant="outline" size="sm" onClick={() => setChoosing(true)}>
            <Plus aria-hidden className="size-3.5" />
            {t('vehicle.items.assign')}
          </Button>
        )}
      </div>

      {choosing && (
        <div className="border-border mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          {free.isPending ? (
            <Loader2 aria-hidden className="text-muted size-4 animate-spin" />
          ) : free.data?.items.length ? (
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              aria-label={t('vehicle.items.choose')}
              className="border-border-strong bg-surface-strong h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
            >
              <option value="">{t('vehicle.items.choose')}</option>
              {free.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {[item.name, item.model, item.serial].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-muted flex-1 text-sm">{t('vehicle.items.noneFree')}</p>
          )}
          <Button size="sm" onClick={assign} disabled={!choice || action.isPending}>
            {t('vehicle.items.assign')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
            {t('vehicle.items.cancel')}
          </Button>
        </div>
      )}
      {action.isError && (
        <p role="alert" className="text-bad mb-2 text-xs">
          {t('vehicle.items.failed')}
        </p>
      )}

      {vehicle.items.length === 0 ? (
        <p className="text-muted py-3 text-sm">{t('vehicle.items.empty')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead className="text-muted text-xs">
              <tr className="border-border border-b">
                <th className="px-1 py-1.5 text-start font-medium">{t('vehicle.items.item')}</th>
                <th className="px-1 py-1.5 text-start font-medium">{t('vehicle.items.model')}</th>
                <th className="px-1 py-1.5 text-start font-medium">{t('vehicle.items.spec')}</th>
                <th className="px-1 py-1.5 text-start font-medium">{t('vehicle.items.serial')}</th>
                <th className="px-1 py-1.5 text-start font-medium">{t('vehicle.items.since')}</th>
                {canEdit && (
                  <th className="px-1 py-1.5">
                    <span className="sr-only">{t('vehicle.items.actions')}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {vehicle.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-border border-b last:border-0"
                  data-item={item.id}
                >
                  <td className="px-1 py-1.5">{item.name}</td>
                  <td className="px-1 py-1.5">
                    {item.model ? <bdi dir="ltr">{item.model}</bdi> : DASH}
                  </td>
                  <td className="text-muted px-1 py-1.5">{item.spec ?? DASH}</td>
                  <td className="num px-1 py-1.5 text-xs">
                    {item.serial ? <bdi dir="ltr">{item.serial}</bdi> : DASH}
                  </td>
                  <td className="text-muted px-1 py-1.5 text-xs">
                    {item.assignedSince ? formatDate(item.assignedSince) : DASH}
                  </td>
                  {canEdit && (
                    <td className="px-1 py-1.5 text-end">
                      <button
                        type="button"
                        onClick={() => action.mutate({ id: item.id, action: 'remove' })}
                        disabled={action.isPending}
                        className="text-muted hover:text-bad inline-flex items-center gap-1 text-xs"
                      >
                        <X aria-hidden className="size-3.5" />
                        {t('vehicle.items.remove')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
