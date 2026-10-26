import { Navigate, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth/session';
import { TopBar } from './TopBar';

/**
 * The one persistent layout for every signed-in screen. Routes render into the
 * Outlet, so the shell (and, from Phase 2, the shared vehicle element) never unmounts.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="text-muted grid min-h-dvh place-items-center text-sm" role="status">
        {t('common.loading')}
      </div>
    );
  }
  if (!user) {
    const next = location.pathname + location.search;
    return (
      <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
    );
  }

  return (
    <div className="min-h-dvh pb-8">
      <a
        href="#main"
        className="bg-accent text-accent-contrast sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50"
      >
        {t('a11y.skipToContent')}
      </a>
      <TopBar user={user} />
      <main id="main" className="mx-auto mt-4 max-w-[1600px] px-2 sm:mt-6 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
}
