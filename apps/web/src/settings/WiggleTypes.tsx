import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { WIGGLE_PROFILES, type WiggleProfile } from '@fleet-hub/shared';
import { lookupName, useLookups } from '@/fleet/data';
import { useAppSettings, useSaveAppSettings } from '@/vehicle/records/api';
import { Panel } from './MySettings';

/**
 * Admins pick which vehicle types take a wiggle test, and with which steering checks
 * (Sagi, 2026-11-08). Loaders, excavators and skid steers take one to start with.
 */
export function WiggleTypes() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const { data: lookups } = useLookups();
  const save = useSaveAppSettings();
  const types = settings.data?.wiggleTypes ?? {};

  const pick = (code: string, profile: WiggleProfile | '') => {
    if (!settings.data) return;
    const { [code]: _old, ...rest } = settings.data.wiggleTypes;
    save.mutate({
      ...settings.data,
      wiggleTypes: profile ? { ...rest, [code]: profile } : rest,
    });
  };

  return (
    <Panel title={t('settings.wiggle.title')} hint={t('settings.wiggle.hint')}>
      {settings.isPlaceholderData || !lookups ? (
        <Loader2 aria-hidden className="text-muted size-5 animate-spin" />
      ) : (
        <ul className="divide-border divide-y" data-testid="wiggle-types">
          {lookups.vehicleTypes.map((vt) => {
            const id = `wiggle-type-${vt.code}`;
            return (
              <li
                key={vt.code}
                className="flex flex-wrap items-center gap-2 py-2"
                data-type={vt.code}
              >
                <label htmlFor={id} className="min-w-32 flex-1 text-sm">
                  {lookupName(vt, i18n.language) ?? vt.code}
                </label>
                <select
                  id={id}
                  value={types[vt.code] ?? ''}
                  onChange={(e) => pick(vt.code, e.target.value as WiggleProfile | '')}
                  className="border-border-strong bg-surface h-9 w-full rounded-md border px-2 text-sm sm:w-64"
                >
                  <option value="">{t('settings.wiggle.none')}</option>
                  {WIGGLE_PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {t(`settings.wiggle.profile.${p}`)}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-muted flex min-h-5 items-center gap-1.5 text-xs" aria-live="polite">
        {save.isPending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
        {save.isError
          ? t('settings.required.saveFailed')
          : save.isSuccess
            ? t('settings.required.saved')
            : null}
      </p>
    </Panel>
  );
}
