import { lazy, Suspense, useEffect } from 'react';
import { Navigate, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, ListChecks, UserRound, Users, type LucideIcon } from 'lucide-react';
import { hasRole, type Role } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { cn } from '@/lib/cn';
import { ListsEditor } from './ListsEditor';
import { MySettings } from './MySettings';
import { UsersAdmin } from './UsersAdmin';

// ExcelJS is large: it loads only when someone opens the import page.
const ImportPage = lazy(() => import('./ImportPage'));

export const SETTINGS_SECTIONS = ['mine', 'lists', 'users', 'import'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const SECTIONS: Record<SettingsSection, { path: string; icon: LucideIcon; role: Role }> = {
  mine: { path: '/settings', icon: UserRound, role: 'VIEWER' },
  // Editors manage the lists too (Sagi, 2026-10-27).
  lists: { path: '/settings/lists', icon: ListChecks, role: 'EDITOR' },
  users: { path: '/settings/users', icon: Users, role: 'ADMIN' },
  import: { path: '/settings/import', icon: FileSpreadsheet, role: 'ADMIN' },
};

/** Settings (SPEC 5.9): your own defaults, the bilingual lists, users, and Excel import. */
export function SettingsPage({ section }: { section: SettingsSection }) {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const title = t(`settings.section.${section}`);

  useEffect(() => {
    document.title = `${title} · ${t('nav.settings')} · ${t('app.name')}`;
  }, [title, t]);

  if (!user) return null;
  const allowed = SETTINGS_SECTIONS.filter((s) => hasRole(user.role, SECTIONS[s].role));
  if (!allowed.includes(section)) return <Navigate to="/settings" replace />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-4">
      <nav aria-label={t('nav.settings')} className="glass h-fit p-1.5">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col">
          {allowed.map((s) => {
            const { path, icon: Icon } = SECTIONS[s];
            return (
              <li key={s} className="shrink-0">
                <NavLink
                  to={path}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-border text-text font-medium'
                        : 'text-muted hover:text-text hover:bg-border/60',
                    )
                  }
                >
                  <Icon aria-hidden className="size-4" />
                  {t(`settings.section.${s}`)}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <section aria-labelledby="settings-title" className="min-w-0">
        <h1 id="settings-title" className="mb-3 text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {section === 'mine' && <MySettings />}
        {section === 'lists' && <ListsEditor />}
        {section === 'users' && <UsersAdmin />}
        {section === 'import' && (
          <Suspense fallback={<SettingsSkeleton />}>
            <ImportPage />
          </Suspense>
        )}
      </section>
    </div>
  );
}

/** Placeholder rows while a settings panel loads. */
export function SettingsSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="glass space-y-2 p-4" role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="bg-border/70 h-9 animate-pulse rounded-md motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
