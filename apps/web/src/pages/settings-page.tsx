import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { localeSchema } from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ProfileForm } from '@/features/account/profile-form';
import { useChangeLocale } from '@/features/account/use-update-me';
import { signOut } from '@/features/auth/auth-api';
import { useUser } from '@/features/auth/session';
import { LOCALES, useLocale } from '@/i18n';

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
        <Section title={t('pages.settings.language')}>
          <LanguageChoice />
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

function LanguageChoice() {
  const { t } = useTranslation();
  const id = useId();
  const current = useLocale();
  const changeLocale = useChangeLocale();
  return (
    <RadioGroup
      aria-label={t('language.label')}
      value={current}
      onValueChange={(value) => {
        changeLocale(localeSchema.parse(value));
      }}
    >
      {LOCALES.map((locale) => (
        <div key={locale} className="flex items-center gap-3">
          <RadioGroupItem id={`${id}-${locale}`} value={locale} />
          <Label htmlFor={`${id}-${locale}`} lang={locale}>
            {t(`language.${locale}`)}
          </Label>
        </div>
      ))}
    </RadioGroup>
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
