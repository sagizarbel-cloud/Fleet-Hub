import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { FleetStage } from '@/fleet/FleetStage';
import { AppShell } from '@/layout/AppShell';
import { AREA_ROUTES, AREAS, type Area } from '@/layout/nav';
import { AreaPage } from '@/pages/AreaPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Hidden review pages stay out of the main bundle.
const DrawingsPage = lazy(() =>
  import('@/pages/DrawingsPage').then((m) => ({ default: m.DrawingsPage })),
);
const I18nCheckPage = lazy(() =>
  import('@/pages/I18nCheckPage').then((m) => ({ default: m.I18nCheckPage })),
);

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
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
      ...AREAS.filter(
        (area): area is Exclude<Area, 'dashboard' | 'fleetTable'> =>
          area !== 'dashboard' && area !== 'fleetTable',
      ).map((area) => ({
        path: AREA_ROUTES[area].path,
        element: <AreaPage area={area} />,
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
