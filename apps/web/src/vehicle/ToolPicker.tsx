import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hammer } from 'lucide-react';
import { EXCAVATOR_TOOLS, hasRole, TOOL_TYPES } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import type { VehicleDetail } from './data';
import { useSetTool } from './records/api';

/**
 * The tool on an excavator's arm (Revisions 1): bucket or hydraulic hammer (Sagi, 2026-11-05). The drawing
 * shows it; editors change it here and the change is logged in Activity.
 */
export function ToolPicker({
  vehicle,
  type,
}: {
  vehicle: VehicleDetail | undefined;
  type: string;
}) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const save = useSetTool(vehicle?.serial ?? '');
  const [failed, setFailed] = useState(false);
  if (!vehicle || !(TOOL_TYPES as readonly string[]).includes(type)) return null;
  const tool = vehicle.tool ?? 'bucket';
  const canEdit = !!user && hasRole(user.role, 'EDITOR');
  const label = t('vehicle.tool.label');
  return (
    <div className="border-border bg-surface flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
      <Hammer aria-hidden className="text-muted size-3.5" />
      {canEdit ? (
        <label className="flex items-center gap-1">
          <span className="sr-only">{t('vehicle.tool.change')}</span>
          <select
            value={tool}
            disabled={save.isPending}
            onChange={(e) => {
              setFailed(false);
              save.mutate(e.target.value, { onError: () => setFailed(true) });
            }}
            title={t('vehicle.tool.change')}
            className="bg-transparent text-xs font-medium focus-visible:outline-2 focus-visible:outline-[var(--fh-accent)]"
            data-testid="tool-picker"
          >
            {EXCAVATOR_TOOLS.map((v) => (
              <option key={v} value={v}>
                {t(`tool.${v}`)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span>
          <span className="text-muted">{label}: </span>
          <span className="font-medium">
            {t(`tool.${tool as (typeof EXCAVATOR_TOOLS)[number]}`)}
          </span>
        </span>
      )}
      {failed && (
        <span role="alert" className="text-bad">
          {t('vehicle.tool.failed')}
        </span>
      )}
    </div>
  );
}
