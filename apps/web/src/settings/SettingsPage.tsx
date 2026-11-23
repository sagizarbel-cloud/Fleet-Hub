import { lazy, Suspense, useEffect } from 'react';
import { Navigate, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Asterisk,
  FileSpreadsheet,
  ListChecks,
  Printer,
  Radio,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { hasRole, type Role } from '@fleet-hub/shared';
import { useSession } from '@/auth/session';
import { cn } from '@/lib/cn';
import { ListsEditor } from './ListsEditor';
import { MySettings } from './MySettings';
import { RequiredFields } from './RequiredFields';
import { CardFieldsSettings } from './CardFields';
import { PermissionsAdmin } from './PermissionsAdmin';
import { WiggleTypes } from './WiggleTypes';
import { ReportLogo } from './ReportLogo';
import { UsersAdmin } from './UsersAdmin';
import { ConnectionsAdmin } from './ConnectionsAdmin';
import { SETTINGS_PATHS, SETTINGS_SECTIONS, type SettingsSection } from './paths';

// ExcelJS is large: it loads only when someone opens the import page.
const ImportPage = lazy(() => import('./ImportPage'));

export { SETTINGS_SECTIONS, type SettingsSection } from './paths';

const ICONS: Record<SettingsSection, LucideIcon> = {
  mine: UserRound,
  lists: ListChecks,
  required: Asterisk,
  permissions: ShieldCheck,
  report: Printer,
  users: Users,
  import: FileSpreadsheet,
  live: Radio,
};
const SECTIONS = Object.fromEntries(
  SETTINGS_SECTIONS.map((s) => [s, { ...SETTINGS_PATHS[s], icon: ICONS[s] }]),
) as Record<SettingsSection, { path: string; icon: LucideIcon; role: Role }>;

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
        {section === 'required' && (
          <div className="space-y-4">
            <RequiredFields />
            <CardFieldsSettings />
            <WiggleTypes />
          </div>
        )}
        {section === 'permissions' && <PermissionsAdmin />}
        {section === 'report' && <ReportLogo />}
        {section === 'users' && <UsersAdmin />}
        {section === 'live' && <ConnectionsAdmin />}
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
