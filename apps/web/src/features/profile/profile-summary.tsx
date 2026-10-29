import { History, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { UserProfile } from '@toasthub/shared';

import { InitialsAvatar } from '@/components/initials-avatar';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';

/** Avatar, name and the leaderboard counts: what every viewer may see (SPEC §4.2). */
export function ProfileSummary({ profile, own }: { profile: UserProfile; own: boolean }) {
  const { t } = useTranslation();
  const format = useFormat();
  const periods = [
    { key: 'week', value: profile.counts.week },
    { key: 'month', value: profile.counts.month },
    { key: 'year', value: profile.counts.year },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <InitialsAvatar name={profile.displayName} avatarId={profile.avatarId} size="lg" />
        <PageHeader title={profile.displayName} className="mb-0 min-w-0 wrap-break-word" />
      </div>
      {own && (
        // Editing and deleting toasts happen there (SPEC §9 `/toasts`).
        <Button asChild variant="outline" className="self-start">
          <Link to="/toasts">
            <History aria-hidden="true" />
            {t('profilePage.myToasts')}
          </Link>
        </Button>
      )}
      <Card className="py-4">
        <CardContent className="px-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {periods.map(({ key, value }) => (
              <div key={key} className="flex flex-col-reverse gap-0.5">
                <dt className="text-sm text-muted-foreground">{t(`profilePage.counts.${key}`)}</dt>
                <dd className="text-2xl font-bold tabular-nums">{format.number(value)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/** Shown instead of stats, heatmap, achievements and photos for a clan-only profile. */
export function ReducedProfileNotice({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">{t('profilePage.reduced', { name })}</p>
      </CardContent>
    </Card>
  );
}
