import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Plus, X } from 'lucide-react';
import { hasRole } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/fleet/FleetGrid';
import { prefersReducedMotion } from '@/lib/motion';
import { ItemChooser, NewItemForVehicle } from './AddItem';
import { useItemAction, type VehicleDetail } from './data';

const DASH = '—';

/** Accessories and work tools on this vehicle, with Assign and Remove for editors and admins. */
export function ItemsTable({ vehicle }: { vehicle: VehicleDetail }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const formatDate = useDateFormat();
  const canEdit = !!user && hasRole(user.role, 'EDITOR');
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const action = useItemAction(vehicle.serial);

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
        <div className="border-border mb-3 rounded-lg border p-2">
          <ItemChooser
            serial={vehicle.serial}
            onDone={() => setChoosing(false)}
            onNew={() => {
              setChoosing(false);
              setCreating(true);
            }}
          />
        </div>
      )}
      {creating && (
        <NewItemForVehicle
          serial={vehicle.serial}
          reduced={reduced}
          onClose={() => setCreating(false)}
        />
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
                  <td className="px-1 py-1.5">
                    <bdi>{item.name}</bdi>
                  </td>
                  <td className="px-1 py-1.5">
                    {item.model ? <bdi dir="ltr">{item.model}</bdi> : DASH}
                  </td>
                  <td className="text-muted px-1 py-1.5">
                    {item.spec ? <bdi>{item.spec}</bdi> : DASH}
                  </td>
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
