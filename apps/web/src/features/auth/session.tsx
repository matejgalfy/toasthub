import { createContext, use, type ReactNode } from 'react';

import type { Me } from '@toasthub/shared';

export type Session =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: Me };

const SessionContext = createContext<Session | null>(null);

/** Supplies the session to the route guards and pages. M5 feeds it from `GET /me`. */
export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

/** The signed-in user; only for components rendered behind `RequireAuth`. */
export function useUser(): Me {
  const session = useSession();
  if (session.status !== 'authenticated') throw new Error('useUser needs an authenticated session');
  return session.user;
}
