import { Lightbulb, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { HomeResponse, Streak } from '@toasthub/shared';

import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';

/** Today's count, the streaks, the fact of the day and the Toast of the week (SPEC §9 `/home`). */
export function HomeCards({ home }: { home: HomeResponse }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t('home.today.label')}
          value={format.number(home.todayCount)}
          unit={t('home.today.unit', { count: home.todayCount })}
          // Announces the new count after "+ Toast".
          live
        />
        <StreakCard label={t('home.streak.label')} streak={home.streak} />
        {home.clanStreak && (
          <StreakCard
            label={t('home.clanStreak.label')}
            streak={home.clanStreak}
            className="col-span-2"
          />
        )}
      </div>
      {home.fact && (
        <InfoCard icon={<Lightbulb aria-hidden="true" />} title={t('home.fact.title')}>
          <p>{home.fact.text}</p>
        </InfoCard>
      )}
      {/* Filled with the weekly winner in M15; until then there is never one. */}
      <InfoCard icon={<Trophy aria-hidden="true" />} title={t('home.toastOfTheWeek.title')}>
        <p className="text-muted-foreground">{t('home.toastOfTheWeek.empty')}</p>
      </InfoCard>
    </>
  );
}

function StreakCard({
  label,
  streak,
  className,
}: {
  label: string;
  streak: Streak;
  className?: string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <StatCard
      label={label}
      value={format.number(streak.current)}
      unit={t('home.streak.unit', { count: streak.current })}
      hint={t('home.streak.longest', { value: format.number(streak.longest) })}
      className={className}
    />
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-5 [&_svg]:text-primary">
          {icon}
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
