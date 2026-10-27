import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { password as passwordSchema } from '@fleet-hub/shared';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { spring } from '@/lib/motion';

const RESET_FIELDS = ['password', 'confirm'] as const;
const FIELD =
  'border-border-strong bg-surface-strong focus:border-accent h-10 w-full rounded-lg border px-3 text-sm outline-none aria-[invalid=true]:border-bad';

/** Opened from the one-time link an admin sends by WhatsApp: choose a password, once. */
export function ResetPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const info = useQuery({
    queryKey: ['reset', token],
    queryFn: () => api<{ name: string; email: string }>(`/auth/reset/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
  const reset = useMutation({
    mutationFn: (password: string) =>
      api<{ ok: true; email: string }>('/auth/reset', {
        method: 'POST',
        json: { token, password },
      }),
  });
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t('reset.title')} · ${t('app.name')}`;
  }, [t]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!passwordSchema.safeParse(values.password).success) return setError('reset.tooShort');
    if (values.password !== values.confirm) return setError('settings.password.mismatch');
    setError(null);
    reset.mutate(values.password);
  };

  const gone =
    (info.error instanceof ApiError && info.error.status === 410) ||
    (reset.error instanceof ApiError && reset.error.status === 410);
  const failed =
    reset.error instanceof ApiError && reset.error.status === 429
      ? 'login.rateLimited'
      : reset.error && !gone
        ? 'login.error'
        : null;

  let body;
  if (info.isPending) {
    body = (
      <p className="text-muted text-sm" role="status">
        {t('common.loading')}
      </p>
    );
  } else if (gone || info.isError) {
    body = (
      <div className="space-y-3" data-testid="reset-invalid">
        <p
          className="border-bad/40 bg-bad/10 text-bad rounded-lg border px-3 py-2 text-sm"
          role="alert"
        >
          {t(gone ? 'reset.invalid' : 'login.error')}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">{t('reset.toLogin')}</Link>
        </Button>
      </div>
    );
  } else if (reset.isSuccess) {
    body = (
      <div className="space-y-3" data-testid="reset-done">
        <p className="text-ok text-sm" role="status">
          {t('reset.done')}
        </p>
        <Button asChild className="w-full">
          <Link to="/login">{t('reset.toLogin')}</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm">
          {t('reset.hello', { name: info.data.name })}{' '}
          <bdi dir="ltr" className="text-muted">
            {info.data.email}
          </bdi>
        </p>
        {/* Lets password managers save the new password under the right account. */}
        <input type="email" hidden readOnly autoComplete="username" value={info.data.email} />
        {RESET_FIELDS.map((key) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm font-medium">{t(`reset.${key}`)}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={values[key]}
              aria-invalid={!!error || undefined}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              className={FIELD}
            />
          </label>
        ))}
        <p className="text-muted text-xs">{t('reset.rule')}</p>
        {(error || failed) && (
          <p
            role="alert"
            className="border-bad/40 bg-bad/10 text-bad rounded-lg border px-3 py-2 text-sm"
          >
            {t((error ?? failed) as never)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {t('reset.submit')}
        </Button>
      </form>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="absolute end-3 top-3 flex gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="glass w-full max-w-sm space-y-5 p-6 sm:p-8"
      >
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div className="font-semibold tracking-tight">{t('app.name')}</div>
        </div>
        <h1 className="text-xl font-semibold">{t('reset.title')}</h1>
        {body}
      </motion.div>
    </div>
  );
}
