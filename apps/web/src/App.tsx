import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from '@/layout/AppShell';
import { AREA_ROUTES, AREAS } from '@/layout/nav';
import { AreaPage } from '@/pages/AreaPage';
import { DrawingsPage } from '@/pages/DrawingsPage';
import { I18nCheckPage } from '@/pages/I18nCheckPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppShell />,
    children: [
      ...AREAS.map((area) =>
        AREA_ROUTES[area].path === '/'
          ? { index: true, element: <AreaPage area={area} /> }
          : { path: AREA_ROUTES[area].path, element: <AreaPage area={area} /> },
      ),
      { path: '/i18n-check', element: <I18nCheckPage /> },
      { path: '/drawings', element: <DrawingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
