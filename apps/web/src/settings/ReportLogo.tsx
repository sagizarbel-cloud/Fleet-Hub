import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { LOGO_MAX_BYTES, LOGO_TYPES } from '@fleet-hub/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { Panel } from './MySettings';

export const LOGO_URL = '/api/settings/logo';

/** Whether a logo is set, and a cache-busting version of its URL. */
export function useLogo() {
  return useQuery({
    queryKey: ['logo'],
    queryFn: async () => {
      const res = await fetch(LOGO_URL, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
    staleTime: 60_000,
  });
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** The company logo printed on vehicle reports (Revisions 1). Admins set and remove it. */
export function ReportLogo() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const logo = useLogo();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['logo'] });
  const save = useMutation({
    mutationFn: (dataUrl: string) => api('/settings/logo', { method: 'PUT', json: { dataUrl } }),
    onSuccess: done,
    onError: () => setError('settings.logo.failed'),
  });
  const remove = useMutation({
    mutationFn: () => api('/settings/logo', { method: 'DELETE' }),
    onSuccess: done,
    onError: () => setError('settings.logo.failed'),
  });

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!(LOGO_TYPES as readonly string[]).includes(file.type))
      return setError('settings.logo.badType');
    if (file.size > LOGO_MAX_BYTES) return setError('settings.logo.tooBig');
    save.mutate(await readAsDataUrl(file));
  };

  return (
    <Panel title={t('settings.logo.title')} hint={t('settings.logo.hint')}>
      <div className="flex flex-wrap items-center gap-4" data-testid="report-logo">
        <div className="border-border grid h-24 w-48 place-items-center rounded-lg border border-dashed bg-white p-2">
          {logo.data ? (
            <img src={logo.data} alt={t('settings.logo.alt')} className="max-h-full max-w-full" />
          ) : (
            <span className="text-xs text-neutral-500">{t('settings.logo.none')}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
            data-testid="logo-input"
          />
          <Button
            size="sm"
            onClick={() => input.current?.click()}
            disabled={save.isPending}
            type="button"
          >
            <ImageUp aria-hidden />
            {t(logo.data ? 'settings.logo.replace' : 'settings.logo.upload')}
          </Button>
          {logo.data && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              type="button"
            >
              <Trash2 aria-hidden />
              {t('settings.logo.remove')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted text-xs">{t('settings.logo.limits')}</p>
      {error && (
        <p role="alert" className="text-bad text-xs">
          {t(error as never)}
        </p>
      )}
    </Panel>
  );
}
