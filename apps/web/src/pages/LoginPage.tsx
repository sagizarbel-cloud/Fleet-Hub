import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { useLogin, useSession } from '@/auth/session';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { spring } from '@/lib/motion';

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    document.title = `${t('login.title')} · ${t('app.name')}`;
  }, [t]);

  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) },
    );
  }

  const error = login.error;
  const errorKey =
    error instanceof ApiError && error.status === 401
      ? 'login.invalid'
      : error instanceof ApiError && error.status === 429
        ? 'login.rateLimited'
        : error
          ? 'login.error'
          : null;

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="absolute end-3 top-3 flex gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.smooth}
        className="glass w-full max-w-sm space-y-5 p-6 sm:p-8"
        aria-labelledby="login-title"
      >
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div>
            <div className="font-semibold tracking-tight">{t('app.name')}</div>
            <div className="text-muted text-xs">{t('app.tagline')}</div>
          </div>
        </div>
        <div>
          <h1 id="login-title" className="text-xl font-semibold">
            {t('login.title')}
          </h1>
          <p className="text-muted mt-1 text-sm">{t('login.subtitle')}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('login.email')}</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-border-strong bg-surface-strong focus:border-accent h-10 w-full rounded-lg border px-3 text-start text-sm outline-none"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('login.password')}</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-border-strong bg-surface-strong focus:border-accent h-10 w-full rounded-lg border px-3 text-sm outline-none"
          />
        </label>

        {errorKey && (
          <p
            role="alert"
            className="border-bad/40 bg-bad/10 text-bad rounded-lg border px-3 py-2 text-sm"
          >
            {t(errorKey)}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
        <p className="text-muted text-center text-xs">{t('login.forgot')}</p>
      </motion.form>
    </div>
  );
}
