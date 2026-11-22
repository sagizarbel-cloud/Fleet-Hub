import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SessionUser } from '@fleet-hub/shared';
import { useCan } from '@/auth/can';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { prefersReducedMotion } from '@/lib/motion';
import { usePreferenceSync, useSaveLook } from '@/settings/prefs';
import { GlobalSearch, SearchPhoneButton } from './GlobalSearch';
import { ScrollableNav } from './ScrollableNav';

const VehicleForm = lazy(() =>
  import('@/vehicle/VehicleForm').then((m) => ({ default: m.VehicleForm })),
);

export function TopBar({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const canAddVehicle = useCan().card('vehicle');
  const ref = useRef<HTMLElement>(null);
  const look = useSaveLook();
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  usePreferenceSync();

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
    <header
      ref={ref}
      className="fh-topbar glass sticky top-2 z-40 mx-2 mt-2 rounded-xl sm:mx-4 sm:mt-3 print:hidden"
    >
      <div className="fh-topbar-bar flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <NavLink
          to="/"
          aria-label={t('app.name')}
          className="fh-sign flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <img src="/favicon.svg" alt="" className="size-7" />
          {/* Phones under 420 px keep only the logo, so the bar's buttons (search included) fit. */}
          <span className="hidden min-[420px]:inline">{t('app.name')}</span>
        </NavLink>

        <GlobalSearch phoneOpen={searching} onPhoneClose={() => setSearching(false)} />

        <div className="ms-auto flex items-center gap-1">
          <SearchPhoneButton onOpen={() => setSearching(true)} />
          {canAddVehicle && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              aria-label={t('vehicleForm.addTitle')}
              title={t('vehicleForm.addTitle')}
              data-testid="add-vehicle"
            >
              <Plus aria-hidden />
              <span className="hidden sm:inline">{t('topbar.add')}</span>
            </Button>
          )}
          <LanguageToggle onChange={look.language} />
          <ThemeToggle onChange={look.theme} />
          <UserMenu user={user} />
        </div>
      </div>

      <ScrollableNav />
      {/* Machine-yellow band with a red end (Yard signage: hazard tape), decorative only. */}
      <div aria-hidden className="fh-band mx-4 h-0.5 rounded-full" />
      {adding && (
        <Suspense>
          <VehicleForm serial={null} reduced={reduced} onClose={() => setAdding(false)} />
        </Suspense>
      )}
    </header>
  );
}
