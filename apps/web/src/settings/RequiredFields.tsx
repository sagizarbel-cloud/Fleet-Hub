import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { FUEL_DETAIL_FIELDS, type FuelDetailField } from '@fleet-hub/shared';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

const LABEL: Record<FuelDetailField, string> = {
  place: 'records.col.place',
  fueledBy: 'records.col.fueledBy',
  fuelType: 'records.col.fuelType',
  provider: 'records.col.provider',
};

/**
 * Admin switches for which record fields must be filled (Revisions 1). For now: the fuel
 * details. The server enforces them on add and edit; Excel imports of old sheets are exempt.
 */
export function RequiredFields() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const save = useSaveAppSettings();
  const required = settings.data?.fuelRequired;

  const toggle = (field: FuelDetailField, on: boolean) => {
    if (!settings.data) return;
    save.mutate({
      ...settings.data,
      fuelRequired: { ...settings.data.fuelRequired, [field]: on },
    });
  };

  return (
    <Panel title={t('settings.required.fuel')} hint={t('settings.required.fuelHint')}>
      {settings.isPlaceholderData ? (
        <Loader2 aria-hidden className="text-muted size-5 animate-spin" />
      ) : (
        <fieldset className="space-y-2">
          <legend className="sr-only">{t('settings.required.fuel')}</legend>
          {FUEL_DETAIL_FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-2.5 text-sm" data-field={f}>
              <input
                type="checkbox"
                checked={!!required?.[f]}
                onChange={(e) => toggle(f, e.target.checked)}
                className="accent-[var(--fh-accent)] size-4"
              />
              {t(LABEL[f] as never)}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-muted flex min-h-5 items-center gap-1.5 text-xs" aria-live="polite">
        {save.isPending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
        {save.isError
          ? t('settings.required.saveFailed')
          : save.isSuccess
            ? t('settings.required.saved')
            : t('settings.required.importNote')}
      </p>
    </Panel>
  );
}
