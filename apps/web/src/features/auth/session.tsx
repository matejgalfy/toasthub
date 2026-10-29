import { useQuery } from '@tanstack/react-query';
import { createContext, use, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Me } from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { changeLocale } from '@/i18n';

import { meQueryOptions } from './me-query';

export type Session =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: Me };

const SessionContext = createContext<Session | null>(null);

/** Supplies a fixed session; tests use it directly, the app goes through `ApiSessionProvider`. */
export function SessionProvider({ value, children }: { value: Session; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** The session from `GET /me`. Also applies the user's saved language once they finished onboarding. */
export function ApiSessionProvider({ children }: { children: ReactNode }) {
  const me = useQuery(meQueryOptions);

  // A new user's `locale` is still the default; onboarding saves the language they are using instead.
  const savedLocale = me.data?.onboarded ? me.data.locale : undefined;
  useEffect(() => {
    if (savedLocale) void changeLocale(savedLocale);
  }, [savedLocale]);

  // Keep a known user through a failed background refetch.
  if (me.data !== undefined) {
    const session: Session = me.data
      ? { status: 'authenticated', user: me.data }
      : { status: 'anonymous' };
    return <SessionProvider value={session}>{children}</SessionProvider>;
  }
  if (me.isError) return <SessionError error={me.error} onRetry={() => void me.refetch()} />;
  return <SessionProvider value={{ status: 'loading' }}>{children}</SessionProvider>;
}

/** Outside the router: without a session we can't tell which page to show. */
function SessionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col items-center justify-center gap-4 px-4 text-center">
      <p role="alert">{t(errorMessageKey(error))}</p>
      <Button onClick={onRetry}>{t('app.retry')}</Button>
    </main>
  );
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
