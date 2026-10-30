import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from '@/features/account/profile-form';
import { signOut } from '@/features/auth/auth-api';
import { useUser } from '@/features/auth/session';

export function SettingsPage() {
  const { t } = useTranslation();
  const user = useUser();
  return (
    <>
      <PageHeader title={t('pages.settings.title')} />
      <div className="flex flex-col gap-6">
        <Section title={t('pages.settings.profile')}>
          <ProfileForm
            user={user}
            submitLabel={t('pages.settings.save')}
            savedMessage={t('pages.settings.saved')}
          />
        </Section>
        <Section title={t('pages.settings.account')}>
          <Account email={user.email} />
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Account({ email }: { email: string }) {
  const { t } = useTranslation();
  const logout = useMutation({
    mutationFn: signOut,
    // A full reload drops every cached query of the old session.
    onSuccess: () => {
      window.location.assign('/');
    },
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('pages.settings.signedInAs', { email })}</p>
      {logout.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t(errorMessageKey(logout.error))}
        </p>
      )}
      <Button
        variant="outline"
        className="self-start"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate();
        }}
      >
        <LogOut aria-hidden="true" />
        {t('auth.logout')}
      </Button>
    </div>
  );
}
