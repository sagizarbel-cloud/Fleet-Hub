import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SessionUser } from '@fleet-hub/shared';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { ScrollableNav } from './ScrollableNav';

export function TopBar({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);

  // Full-screen layers (the vehicle stage) start just below the sticky bar.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--fh-header-h', `${el.offsetHeight + 16}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="glass sticky top-2 z-40 mx-2 mt-2 rounded-xl sm:mx-4 sm:mt-3">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <NavLink to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span>{t('app.name')}</span>
        </NavLink>

        <div className="ms-2 hidden max-w-md flex-1 md:block">
          <label className="relative block">
            <span className="sr-only">{t('topbar.search')}</span>
            <Search
              aria-hidden
              className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            />
            <input
              type="search"
              disabled
              title={t('topbar.comingSoon')}
              placeholder={t('topbar.search')}
              className="border-border bg-surface-strong/40 placeholder:text-muted h-9 w-full rounded-lg border ps-9 pe-3 text-sm disabled:cursor-not-allowed"
            />
          </label>
        </div>

        <div className="ms-auto flex items-center gap-1">
          <Button
            size="sm"
            disabled
            title={t('topbar.comingSoon')}
            className="hidden sm:inline-flex"
          >
            <Plus aria-hidden />
            {t('topbar.add')}
          </Button>
          <LanguageToggle />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>

      <ScrollableNav />
    </header>
  );
}
