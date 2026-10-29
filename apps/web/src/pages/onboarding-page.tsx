import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/features/account/profile-form';
import { useUser } from '@/features/auth/session';
import { useLocale } from '@/i18n';

export function OnboardingPage() {
  const { t } = useTranslation();
  const user = useUser();
  const locale = useLocale();
  // Saving the form flips `onboarded`, which also lands here.
  if (user.onboarded) return <Navigate to="/home" replace />;
  return (
    <>
      <PageHeader title={t('pages.onboarding.title')} />
      <p className="mb-8 text-muted-foreground">{t('pages.onboarding.intro')}</p>
      {/* A new account's locale is the API default; keep the language they are using. */}
      <ProfileForm user={user} submitLabel={t('pages.onboarding.submit')} extra={{ locale }} />
    </>
  );
}
