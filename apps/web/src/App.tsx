import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { FleetStage } from '@/fleet/FleetStage';
import { AppShell } from '@/layout/AppShell';
import { AREA_ROUTES } from '@/layout/nav';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPage } from '@/pages/ResetPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Hidden review pages stay out of the main bundle.
const DrawingsPage = lazy(() =>
  import('@/pages/DrawingsPage').then((m) => ({ default: m.DrawingsPage })),
);
// Receipts, quotes and equipment load when first opened.
const ReceiptsPage = lazy(() =>
  import('@/money/Receipts').then((m) => ({ default: m.ReceiptsPage })),
);
const QuotesPage = lazy(() => import('@/money/Quotes').then((m) => ({ default: m.QuotesPage })));
const EquipmentPage = lazy(() =>
  import('@/money/Equipment').then((m) => ({ default: m.EquipmentPage })),
);
const MONEY_PAGES = { receipts: ReceiptsPage, quotes: QuotesPage, equipment: EquipmentPage };
const SettingsPage = lazy(() =>
  import('@/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SETTINGS = [
  ['mine', '/settings'],
  ['lists', '/settings/lists'],
  ['users', '/settings/users'],
  ['import', '/settings/import'],
] as const;
const I18nCheckPage = lazy(() =>
  import('@/pages/I18nCheckPage').then((m) => ({ default: m.I18nCheckPage })),
);

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/reset/:token', element: <ResetPage /> },
  {
    element: <AppShell />,
    children: [
      // Dashboard, fleet table and vehicle page share one persistent layout (SPEC 5.2).
      {
        element: <FleetStage />,
        children: [
          { index: true, element: null },
          { path: '/fleet', element: null },
          { path: '/vehicles/:serial', element: null },
        ],
      },
      ...(['receipts', 'quotes', 'equipment'] as const).map((area) => {
        const Page = MONEY_PAGES[area];
        return {
          path: AREA_ROUTES[area].path,
          element: (
            <Suspense>
              <Page />
            </Suspense>
          ),
        };
      }),
      ...SETTINGS.map(([section, path]) => ({
        path,
        element: (
          <Suspense>
            <SettingsPage section={section} />
          </Suspense>
        ),
      })),
      {
        path: '/i18n-check',
        element: (
          <Suspense>
            <I18nCheckPage />
          </Suspense>
        ),
      },
      {
        path: '/drawings',
        element: (
          <Suspense>
            <DrawingsPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
