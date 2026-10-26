import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VehicleStatus } from '@fleet-hub/shared';
import { cn } from '@/lib/cn';

const STYLE: Record<VehicleStatus, { icon: typeof CircleCheck; className: string }> = {
  GREEN: { icon: CircleCheck, className: 'text-ok border-ok/40 bg-ok/10' },
  AMBER: { icon: TriangleAlert, className: 'text-warn border-warn/40 bg-warn/10' },
  RED: { icon: CircleX, className: 'text-bad border-bad/40 bg-bad/10' },
};

/** Status is always color + icon + label, so it reads without color. */
export function StatusBadge({ status, className }: { status: VehicleStatus; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, className: tone } = STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`status.${status}`)}
    </span>
  );
}
