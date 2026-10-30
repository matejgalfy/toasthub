import { Lightbulb, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { HomeResponse, Streak } from '@toasthub/shared';

import { ClanAvatar } from '@/components/clan-avatar';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TotwEntry } from '@/features/toast-of-the-week/totw-entry';
import { useFormat } from '@/i18n/format';

/** The streaks, the fact of the day and the Toast of the week (SPEC §9 `/home`). */
export function HomeCards({ home }: { home: HomeResponse }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {/* Announces the new streak after "+ Toast". */}
        <StreakCard label={t('home.streak.label')} streak={home.streak} live />
        {home.clan && home.clanStreak && (
          <Link
            to={`/clans/${home.clan.id}`}
            className="rounded-xl transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>*]:hover:bg-accent"
          >
            <StreakCard
              label={t('home.clanStreak.label')}
              streak={home.clanStreak}
              media={<ClanAvatar name={home.clan.name} avatarId={home.clan.avatarId} size="sm" />}
            />
          </Link>
        )}
      </div>
      {home.fact && (
        <InfoCard icon={<Lightbulb aria-hidden="true" />} title={t('home.fact.title')}>
          <p>{home.fact.text}</p>
        </InfoCard>
      )}
      <InfoCard icon={<Trophy aria-hidden="true" />} title={t('home.toastOfTheWeek.title')}>
        {home.toastOfTheWeek ? (
          <TotwEntry entry={home.toastOfTheWeek} />
        ) : (
          <p className="text-muted-foreground">{t('home.toastOfTheWeek.empty')}</p>
        )}
      </InfoCard>
    </>
  );
}

function StreakCard({
  label,
  streak,
  media,
  live,
}: {
  label: string;
  streak: Streak;
  media?: ReactNode;
  live?: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <StatCard
      label={label}
      value={format.number(streak.current)}
      unit={t('home.streak.unit', { count: streak.current })}
      hint={t('home.streak.longest', { value: format.number(streak.longest) })}
      media={media}
      live={live}
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
