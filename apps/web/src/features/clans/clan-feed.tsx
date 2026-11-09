import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { FeedList } from '@/features/feed/feed-list';

import { clanFeedQueryOptions } from './clans-api';

/** Current members' toast sessions, newest first (SPEC §4.8). */
export function ClanFeed({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const feed = useInfiniteQuery(clanFeedQueryOptions(clanId));
  return <FeedList feed={feed} empty={t('clans.feed.empty')} />;
}
