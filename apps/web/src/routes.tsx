import { Navigate, type RouteObject } from 'react-router';

import { AppLayout, PublicLayout } from '@/components/layout/app-layout';
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  RequireOnboarded,
} from '@/features/auth/guards';
import { AdminClanPage } from '@/pages/admin/admin-clan-page';
import { AdminClansPage } from '@/pages/admin/admin-clans-page';
import { AdminFlagsPage } from '@/pages/admin/admin-flags-page';
import { AdminMetricsPage } from '@/pages/admin/admin-metrics-page';
import { AdminPage } from '@/pages/admin/admin-page';
import { AdminSettingsPage } from '@/pages/admin/admin-settings-page';
import { AdminTotwPage } from '@/pages/admin/admin-totw-page';
import { AdminUsersPage } from '@/pages/admin/admin-users-page';
import { AuthCallbackPage } from '@/pages/auth-callback-page';
import { ClanNewPage } from '@/pages/clan-new-page';
import { ClanPage } from '@/pages/clan-page';
import { ClansPage } from '@/pages/clans-page';
import { HomePage } from '@/pages/home-page';
import { LandingPage } from '@/pages/landing-page';
import { LeaderboardsPage } from '@/pages/leaderboards-page';
import { LoginPage } from '@/pages/login-page';
import { MyToastsPage } from '@/pages/my-toasts-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { OnboardingPage } from '@/pages/onboarding-page';
import { ProfilePage } from '@/pages/profile-page';
import { SettingsPage } from '@/pages/settings-page';

// The route tree from SPEC §9.
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: 'login', element: <LoginPage /> },
        ],
      },
      { path: 'auth/callback', element: <AuthCallbackPage /> },
      {
        element: <RequireAuth />,
        children: [{ path: 'onboarding', element: <OnboardingPage /> }],
      },
    ],
  },
  {
    element: <RequireOnboarded />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: 'home', element: <HomePage /> },
          { path: 'toasts', element: <MyToastsPage /> },
          { path: 'leaderboards', element: <LeaderboardsPage /> },
          { path: 'clans', element: <ClansPage /> },
          { path: 'clans/new', element: <ClanNewPage /> },
          { path: 'clans/:id', element: <ClanPage /> },
          { path: 'u/:id', element: <ProfilePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AppLayout wide />,
            children: [
              {
                path: 'admin',
                element: <AdminPage />,
                children: [
                  { index: true, element: <Navigate to="flags" replace /> },
                  { path: 'flags', element: <AdminFlagsPage /> },
                  { path: 'users', element: <AdminUsersPage /> },
                  { path: 'clans', element: <AdminClansPage /> },
                  { path: 'clans/:id', element: <AdminClanPage /> },
                  { path: 'settings', element: <AdminSettingsPage /> },
                  { path: 'metrics', element: <AdminMetricsPage /> },
                  { path: 'totw', element: <AdminTotwPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  // Design preview: tokens and components. Left out of production builds.
  ...(import.meta.env.DEV
    ? [
        {
          path: 'dev/ui',
          lazy: async () => ({
            Component: (await import('@/pages/dev/ui-preview-page')).UiPreviewPage,
          }),
        },
      ]
    : []),
  {
    element: <PublicLayout />,
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
];
