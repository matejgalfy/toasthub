import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type ClanRank, Period, type UserRank } from '@toasthub/shared';

import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { useUser } from '@/features/auth/session';

import {
  clanLeaderboardQueryOptions,
  clanMemberLeaderboardQueryOptions,
  userLeaderboardQueryOptions,
} from './leaderboards-api';
import { PeriodSwitch, PinnedRank, type RankEntry, RankList } from './rank-list';

const userEntry = ({ rank, user, count }: UserRank): RankEntry => ({
  id: user.id,
  rank,
  name: user.displayName,
  href: `/u/${user.id}`,
  count,
  avatarId: user.avatarId,
});

const clanEntry = ({ rank, clan, count, currentStreak }: ClanRank): RankEntry => ({
  id: clan.id,
  rank,
  name: clan.name,
  href: `/clans/${clan.id}`,
  count,
  streak: currentStreak,
});

interface BoardProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
}

/** Users by toasts in the period; the caller's row is pinned above (SPEC §9 `/leaderboards`). */
export function UserBoard({ period, onPeriodChange }: BoardProps) {
  const { t } = useTranslation();
  const board = useQuery(userLeaderboardQueryOptions(period));
  return (
    <Board period={period} onPeriodChange={onPeriodChange} query={board}>
      {(data) => (
        <>
          <PinnedRank
            title={t('leaderboards.you')}
            entry={data.me && userEntry(data.me)}
            hint={t(`leaderboards.noToasts.${period}`)}
          />
          <Ranking
            entries={data.items.map(userEntry)}
            mineId={data.me?.user.id}
            label={t('leaderboards.usersLabel')}
          />
        </>
      )}
    </Board>
  );
}

/** Clans by toasts credited to them, with their 🔥 streak; the caller's clan is pinned above. */
export function ClanBoard({ period, onPeriodChange }: BoardProps) {
  const { t } = useTranslation();
  const me = useUser();
  const board = useQuery(clanLeaderboardQueryOptions(period));
  return (
    <Board period={period} onPeriodChange={onPeriodChange} query={board}>
      {(data) => (
        <>
          {me.clanId !== null && (
            <PinnedRank
              title={t('leaderboards.yourClan')}
              entry={data.myClan && clanEntry(data.myClan)}
              hint={t(`leaderboards.noClanToasts.${period}`)}
            />
          )}
          <Ranking
            entries={data.items.map(clanEntry)}
            mineId={data.myClan?.clan.id}
            label={t('leaderboards.clansLabel')}
          />
        </>
      )}
    </Board>
  );
}

/** The clan page's Leaderboard tab: every current member, this month by default (SPEC §4.7). */
export function ClanMemberBoard({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const me = useUser();
  const [period, setPeriod] = useState<Period>(Period.month);
  const board = useQuery(clanMemberLeaderboardQueryOptions(clanId, period));
  return (
    <Board period={period} onPeriodChange={setPeriod} query={board}>
      {(items) => (
        <Ranking
          entries={items.map(userEntry)}
          mineId={me.id}
          label={t('leaderboards.membersLabel')}
        />
      )}
    </Board>
  );
}

function Board<T>({
  period,
  onPeriodChange,
  query,
  children,
}: BoardProps & { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PeriodSwitch value={period} onChange={onPeriodChange} />
      {query.isPending ? (
        <PageSpinner className="min-h-40" />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        children(query.data)
      )}
    </div>
  );
}

function Ranking({
  entries,
  mineId,
  label,
}: {
  entries: RankEntry[];
  mineId?: string;
  label: string;
}) {
  const { t } = useTranslation();
  if (entries.length === 0)
    return <p className="text-muted-foreground">{t('leaderboards.empty')}</p>;
  return <RankList entries={entries} mineId={mineId} label={label} />;
}
