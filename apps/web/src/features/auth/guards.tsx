import { Navigate, Outlet, useLocation } from 'react-router';

import { PageSpinner } from '@/components/page-spinner';

import { useSession } from './session';

// Layout routes that gate their children on the session. They nest: RequireAuth > RequireOnboarded >
// RequireAdmin, and each also handles the cases of the guards above it, so any one can stand alone.

/** Signed-in users only; others go to /login, which can send them back afterwards (`state.from`). */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <PageSpinner />;
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Users who finished onboarding; new users are sent there first. */
export function RequireOnboarded() {
  const session = useSession();
  if (session.status !== 'authenticated') return <RequireAuth />;
  if (!session.user.onboarded) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Admins only; everyone else lands on /home. */
export function RequireAdmin() {
  const session = useSession();
  if (session.status !== 'authenticated' || !session.user.onboarded) return <RequireOnboarded />;
  if (session.user.role !== 'admin') return <Navigate to="/home" replace />;
  return <Outlet />;
}

/** Public-only pages (landing, login): signed-in users go straight to /home. */
export function RedirectIfAuthenticated() {
  const session = useSession();
  if (session.status === 'loading') return <PageSpinner />;
  if (session.status === 'authenticated') return <Navigate to="/home" replace />;
  return <Outlet />;
}
