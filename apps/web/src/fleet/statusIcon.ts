import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { VehicleStatus } from '@fleet-hub/shared';

/** Status icon and colour; always shown with a label or an accessible name. */
export const STATUS_ICON: Record<VehicleStatus, { icon: typeof CircleCheck; tone: string }> = {
  GREEN: { icon: CircleCheck, tone: 'text-ok' },
  AMBER: { icon: TriangleAlert, tone: 'text-warn' },
  RED: { icon: CircleX, tone: 'text-bad' },
};
