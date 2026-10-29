import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { safeNext } from '@/features/auth/auth-api';
import { MagicLinkForm } from '@/features/auth/magic-link-form';
import { useSession } from '@/features/auth/session';

// What Better Auth's verify puts in `?error=` for a link that is used up or too old.
const DEAD_LINK_ERRORS = new Set(['INVALID_TOKEN', 'EXPIRED_TOKEN']);

/**
 * The magic link's landing page. The API has already checked the token and set the cookie (or not) and
 * redirected here, so the page only reads the session (SPEC §9 `/auth/callback`).
 */
export function AuthCallbackPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const session = useSession();
  const error = params.get('error');

  if (session.status === 'loading') return <PageSpinner />;
  // Also when an old link is opened while already signed in: nothing to fix then.
  if (session.status === 'authenticated') {
    return (
      <Navigate
        to={session.user.onboarded ? safeNext(params.get('next')) : '/onboarding'}
        replace
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col">
      <PageHeader title={t('pages.authCallback.title')} />
      <p className="mb-6 text-muted-foreground">
        {error === null || DEAD_LINK_ERRORS.has(error)
          ? t('auth.callback.deadLink')
          : t('auth.callback.failed')}
      </p>
      <MagicLinkForm submitLabel={t('auth.callback.resend')} />
    </div>
  );
}
