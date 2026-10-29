import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Period } from '@toasthub/shared';

import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClanBoard, UserBoard } from '@/features/leaderboards/boards';

type Tab = 'users' | 'clans';

/** Tabs Users / Clans, each with its own period: users this week, clans this month (SPEC §4.7, §9). */
export function LeaderboardsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('users');
  // Kept here, so switching tabs doesn't reset the period.
  const [userPeriod, setUserPeriod] = useState<Period>(Period.week);
  const [clanPeriod, setClanPeriod] = useState<Period>(Period.month);
  return (
    <>
      <PageHeader title={t('pages.leaderboards.title')} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <TabsList aria-label={t('leaderboards.tabs.label')} className="w-full">
          <TabsTrigger value="users">{t('leaderboards.tabs.users')}</TabsTrigger>
          <TabsTrigger value="clans">{t('leaderboards.tabs.clans')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="pt-4">
          <UserBoard period={userPeriod} onPeriodChange={setUserPeriod} />
        </TabsContent>
        <TabsContent value="clans" className="pt-4">
          <ClanBoard period={clanPeriod} onPeriodChange={setClanPeriod} />
        </TabsContent>
      </Tabs>
    </>
  );
}
