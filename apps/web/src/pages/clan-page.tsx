import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { ClanAction, canActOnClan, clanParamsSchema, type ClanDetail } from '@toasthub/shared';

import { ApiError } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { meQueryKey } from '@/features/auth/me-query';
import { useUser } from '@/features/auth/session';
import { ClanFeed } from '@/features/clans/clan-feed';
import { ClanHeader } from '@/features/clans/clan-header';
import { ClanMembers } from '@/features/clans/clan-members';
import { ClanSettings } from '@/features/clans/clan-settings';
import { clanQueryOptions } from '@/features/clans/clans-api';
import { JoinRequests } from '@/features/clans/join-requests';
import { ClanMemberBoard } from '@/features/leaderboards/boards';

/** One clan: header, requests for Officers+, tabs Feed / Leaderboard / Members / Settings (SPEC §9). */
export function ClanPage() {
  const { id = '' } = useParams();
  if (!clanParamsSchema.safeParse({ id }).success) return <ClanNotFound />;
  // A fresh view per clan, so the selected tab doesn't carry over.
  return <ClanView key={id} clanId={id} />;
}

function ClanView({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const clan = useQuery(clanQueryOptions(clanId));

  if (clan.isPending) {
    return (
      <>
        <PageHeader title={t('pages.clan.title')} />
        <PageSpinner />
      </>
    );
  }
  if (clan.isError) {
    if (clan.error instanceof ApiError && clan.error.status === 404) return <ClanNotFound />;
    return (
      <>
        <PageHeader title={t('pages.clan.title')} />
        <QueryError error={clan.error} onRetry={() => void clan.refetch()} />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <SyncMyClan detail={clan.data} />
      <ClanHeader detail={clan.data} />
      {canActOnClan(clan.data.myRole, ClanAction.viewRequests) && <JoinRequests clanId={clanId} />}
      <ClanTabs detail={clan.data} />
    </div>
  );
}

type Tab = 'feed' | 'leaderboard' | 'members' | 'settings';

function ClanTabs({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const isMember = canActOnClan(detail.myRole, ClanAction.viewFeed);
  const isOwner = canActOnClan(detail.myRole, ClanAction.edit);
  const tabs: Tab[] = [
    // The feed is for members only (SPEC §4.8).
    ...(isMember ? (['feed'] as const) : []),
    'leaderboard',
    'members',
    ...(isOwner ? (['settings'] as const) : []),
  ];
  const [selected, setSelected] = useState<Tab>(isMember ? 'feed' : 'members');
  // After leaving, a demotion or a transfer, the selected tab may no longer exist.
  const tab = tabs.includes(selected) ? selected : 'members';

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setSelected(value as Tab);
      }}
    >
      <TabsList aria-label={t('clans.tabs.label')} className="w-full">
        {tabs.map((id) => (
          <TabsTrigger key={id} value={id}>
            {t(`clans.tabs.${id}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {isMember && (
        <TabsContent value="feed" className="pt-4">
          <ClanFeed clanId={detail.clan.id} />
        </TabsContent>
      )}
      <TabsContent value="leaderboard" className="pt-4">
        <ClanMemberBoard clanId={detail.clan.id} />
      </TabsContent>
      <TabsContent value="members" className="pt-2">
        <ClanMembers detail={detail} />
      </TabsContent>
      {isOwner && (
        <TabsContent value="settings" className="pt-4">
          <ClanSettings clan={detail.clan} />
        </TabsContent>
      )}
    </Tabs>
  );
}

/**
 * `/me` names the caller's clan for the Clan tab, but someone else's action (an approval, a kick) changes
 * it without the caller doing anything. When this clan's answer disagrees, `/me` is refetched.
 */
function SyncMyClan({ detail }: { detail: ClanDetail }) {
  const queryClient = useQueryClient();
  const me = useUser();
  const memberHere = detail.myRole !== null;
  const meSaysHere = me.clanId === detail.clan.id;
  useEffect(() => {
    if (memberHere !== meSaysHere) void queryClient.invalidateQueries({ queryKey: meQueryKey });
  }, [memberHere, meSaysHere, queryClient]);
  return null;
}

/** An unknown or deleted clan. */
function ClanNotFound() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('pages.clan.title')} />
      <Card>
        <CardContent className="flex flex-col items-start gap-4">
          <p>{t('clans.notFound')}</p>
          <Button asChild variant="outline">
            <Link to="/clans">{t('clans.browse')}</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
