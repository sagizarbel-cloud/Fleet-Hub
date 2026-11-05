import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { hasRole, VEHICLE_STATUSES, type VehicleStatus } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { Popover } from '@/components/Popover';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { VehicleDetail } from './data';
import { useStatusOverride } from './records/api';
import { useRecordLink } from './records/recordLink';

/**
 * The status pill. Admins can set the colour by hand, with a reason, and go back to the
 * derived colour (SPEC A7); both are logged in the vehicle's activity.
 */
export function StatusControl({
  vehicle,
  fallback,
}: {
  vehicle: VehicleDetail | undefined;
  fallback: VehicleStatus;
}) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const status = vehicle?.status ?? fallback;
  const manual = !!vehicle?.statusOverride;
  const badge = (
    <span className="inline-flex items-center gap-1">
      <StatusBadge status={status} />
      {manual && (
        <span
          className="text-muted inline-flex items-center gap-0.5 text-xs"
          title={vehicle?.statusOverrideReason ?? ''}
        >
          <Hand aria-hidden className="size-3.5" />
          {t('vehicle.override.manual')}
        </span>
      )}
    </span>
  );
  const report = useRecordLink();
  const open = vehicle?.computed.openMalfunctions ?? 0;
  // Revisions 1 (fleet manager): the status opens the malfunction report, for everyone.
  const opener = vehicle ? (
    <button
      type="button"
      onClick={() => report.open('malfunctions', 'open')}
      className="hover:ring-border-strong inline-flex items-center gap-1 rounded-full hover:ring-1"
      aria-label={t('report.statusHint', { status: t(`status.${status}`), count: open })}
      title={t('report.statusHint', { status: t(`status.${status}`), count: open })}
      data-testid="open-issues"
    >
      {badge}
      {open > 0 && (
        <span className="text-warn inline-flex items-center gap-0.5 pe-1.5 text-xs font-medium">
          <TriangleAlert aria-hidden className="size-3.5" />
          <span className="num">{open}</span>
        </span>
      )}
    </button>
  ) : (
    badge
  );

  if (!vehicle || !user || !hasRole(user.role, 'ADMIN')) return opener;

  return (
    <span className="inline-flex items-center gap-1">
      {opener}
      <Popover
        label={t('vehicle.override.title')}
        trigger={<SlidersHorizontal aria-hidden className="size-3.5" />}
        className="[&>button]:text-muted [&>button]:hover:text-text [&>button]:size-7 [&>button]:p-0"
        panelClassName="w-72"
      >
        {(close) => <OverrideForm vehicle={vehicle} close={close} />}
      </Popover>
    </span>
  );
}

function OverrideForm({ vehicle, close }: { vehicle: VehicleDetail; close: () => void }) {
  const { t } = useTranslation();
  const save = useStatusOverride(vehicle.serial);
  const [choice, setChoice] = useState<VehicleStatus>(vehicle.statusOverride ?? vehicle.status);
  const [reason, setReason] = useState('');
  const [failed, setFailed] = useState(false);
  const done = { onSuccess: close, onError: () => setFailed(true) };

  return (
    <form
      className="space-y-3 p-1 text-sm"
      data-testid="status-override"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim())
          save.mutate({ mode: 'set', status: choice, reason: reason.trim() }, done);
      }}
    >
      <p className="text-muted text-xs">
        {vehicle.statusOverride
          ? t('vehicle.override.currentManual', { reason: vehicle.statusOverrideReason ?? '' })
          : t('vehicle.override.currentAuto')}
      </p>
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">{t('vehicle.override.choose')}</legend>
        {VEHICLE_STATUSES.map((s) => (
          <label
            key={s}
            className={cn(
              'cursor-pointer rounded-full border-2 border-transparent',
              choice === s && 'border-accent',
            )}
          >
            <input
              type="radio"
              name="override-status"
              value={s}
              checked={choice === s}
              onChange={() => setChoice(s)}
              className="sr-only"
            />
            <StatusBadge status={s} />
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1 text-xs font-medium">
        <span>{t('vehicle.override.reason')}</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          required
          className="border-border-strong bg-surface h-8 w-full rounded-md border px-2 text-sm"
        />
      </label>
      {failed && (
        <p role="alert" className="text-bad text-xs">
          {t('records.error.save')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {vehicle.statusOverride && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => save.mutate({ mode: 'clear' }, done)}
            disabled={save.isPending}
          >
            {t('vehicle.override.clear')}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={save.isPending || !reason.trim()}>
          {t('vehicle.override.set')}
        </Button>
      </div>
    </form>
  );
}
