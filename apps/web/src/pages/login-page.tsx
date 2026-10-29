import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { MagicLinkForm } from '@/features/auth/magic-link-form';

/** The page `RequireAuth` bounced the user from (`state.from`), to return there after login. */
function returnPath(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('from' in state)) return undefined;
  const { from } = state;
  if (typeof from !== 'object' || from === null) return undefined;
  const { pathname, search } = from as { pathname?: unknown; search?: unknown };
  if (typeof pathname !== 'string') return undefined;
  return `${pathname}${typeof search === 'string' ? search : ''}`;
}

export function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <div className="mx-auto flex max-w-sm flex-col">
      <PageHeader title={t('pages.login.title')} />
      <p className="mb-6 text-muted-foreground">{t('auth.login.intro')}</p>
      <MagicLinkForm submitLabel={t('auth.login.submit')} next={returnPath(location.state)} />
    </div>
  );
}
