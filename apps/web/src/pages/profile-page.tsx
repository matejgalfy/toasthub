import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { userParamsSchema } from '@toasthub/shared';

import { ApiError } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUser } from '@/features/auth/session';
import { AchievementGrid } from '@/features/profile/achievement-grid';
import { PhotoGrid } from '@/features/profile/photo-grid';
import {
  achievementsQueryOptions,
  profileQueryOptions,
  statsQueryOptions,
} from '@/features/profile/profile-api';
import { ProfileSection, QueryContent } from '@/features/profile/profile-section';
import { ProfileStats } from '@/features/profile/profile-stats';
import { ProfileSummary, ReducedProfileNotice } from '@/features/profile/profile-summary';
import { YearHeatmap } from '@/features/profile/year-heatmap';

/** A user's profile, full or reduced by their visibility (SPEC §9 `/u/:id`, §12 D45). */
export function ProfilePage() {
  const { id = '' } = useParams();
  if (!userParamsSchema.safeParse({ id }).success) return <ProfileNotFound />;
  // A fresh view per user, so the heatmap year doesn't carry over.
  return <ProfileView key={id} userId={id} />;
}

function ProfileView({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const me = useUser();
  const profile = useQuery(profileQueryOptions(userId));

  if (profile.isPending) {
    return (
      <>
        <PageHeader title={t('pages.profile.title')} />
        <PageSpinner />
      </>
    );
  }
  if (profile.isError) {
    if (profile.error instanceof ApiError && profile.error.status === 404) {
      return <ProfileNotFound />;
    }
    return (
      <>
        <PageHeader title={t('pages.profile.title')} />
        <QueryError error={profile.error} onRetry={() => void profile.refetch()} />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <ProfileSummary profile={profile.data} own={profile.data.id === me.id} />
      {/* The other routes answer 403 for a reduced view, so they aren't called at all. */}
      {profile.data.access === 'full' ? (
        <FullProfile userId={userId} />
      ) : (
        <ReducedProfileNotice name={profile.data.displayName} />
      )}
    </div>
  );
}

function FullProfile({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const stats = useQuery(statsQueryOptions(userId));
  const achievements = useQuery(achievementsQueryOptions(userId));
  return (
    <>
      <ProfileSection title={t('profilePage.stats.title')}>
        <QueryContent query={stats}>{(data) => <ProfileStats stats={data} />}</QueryContent>
      </ProfileSection>
      <YearHeatmap userId={userId} firstToastDate={stats.data?.totals.firstToastDate} />
      <ProfileSection title={t('profilePage.achievements.title')}>
        <QueryContent query={achievements}>
          {(data) => <AchievementGrid achievements={data} />}
        </QueryContent>
      </ProfileSection>
      <ProfileSection title={t('profilePage.photos.title')}>
        <PhotoGrid userId={userId} />
      </ProfileSection>
    </>
  );
}

/** Unknown, banned and not yet onboarded users all look the same (D45). */
function ProfileNotFound() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('pages.profile.title')} />
      <Card>
        <CardContent className="flex flex-col items-start gap-4">
          <p>{t('profilePage.notFound')}</p>
          <Button asChild variant="outline">
            <Link to="/home">{t('pages.notFound.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
