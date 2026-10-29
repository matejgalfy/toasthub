import type { RouteObject } from 'react-router';

import { AppLayout, PublicLayout } from '@/components/layout/app-layout';
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  RequireOnboarded,
} from '@/features/auth/guards';
import { AuthCallbackPage } from '@/pages/auth-callback-page';
import { HomePage } from '@/pages/home-page';
import { LandingPage } from '@/pages/landing-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { OnboardingPage } from '@/pages/onboarding-page';
import { PlaceholderPage } from '@/pages/placeholder-page';
import { SettingsPage } from '@/pages/settings-page';

// The route tree from SPEC §9. Milestones replace each PlaceholderPage with the real page.
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
          { path: 'leaderboards', element: <PlaceholderPage page="leaderboards" /> },
          { path: 'clans', element: <PlaceholderPage page="clans" /> },
          { path: 'clans/new', element: <PlaceholderPage page="clanNew" /> },
          { path: 'clans/:id', element: <PlaceholderPage page="clan" /> },
          { path: 'u/:id', element: <PlaceholderPage page="profile" /> },
          { path: 'toast-of-the-week', element: <PlaceholderPage page="toastOfTheWeek" /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      {
        element: <RequireAdmin />,
        children: [
          {
            element: <AppLayout wide />,
            children: [{ path: 'admin/*', element: <PlaceholderPage page="admin" /> }],
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
