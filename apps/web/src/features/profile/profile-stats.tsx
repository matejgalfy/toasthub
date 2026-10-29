import { useTranslation } from 'react-i18next';

import type { UserStats } from '@toasthub/shared';

import { StatCard } from '@/components/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';

/** Totals, streak, best day and averages (SPEC §4.6). */
export function ProfileStats({ stats }: { stats: UserStats }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { totals, bestDay, streak, averages } = stats;
  const average = (value: number) => format.number(value, { maximumFractionDigits: 1 });
  const rates = [
    { key: 'perDay', value: averages.perDay },
    { key: 'perWeek', value: averages.perWeek },
    { key: 'perMonth', value: averages.perMonth },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard
        label={t('profilePage.stats.total')}
        value={format.number(totals.allTime)}
        unit={t('profilePage.stats.unit', { count: totals.allTime })}
        hint={
          totals.firstToastDate
            ? t('profilePage.stats.since', { date: format.localDate(totals.firstToastDate) })
            : undefined
        }
      />
      <StatCard
        label={t('home.streak.label')}
        value={format.number(streak.current)}
        unit={t('home.streak.unit', { count: streak.current })}
        hint={t('home.streak.longest', { value: format.number(streak.longest) })}
      />
      <StatCard
        label={t('profilePage.stats.bestDay')}
        value={bestDay ? format.number(bestDay.count) : '–'}
        unit={bestDay ? t('profilePage.stats.unit', { count: bestDay.count }) : undefined}
        hint={bestDay ? format.localDate(bestDay.date) : t('profilePage.stats.noToasts')}
        className="col-span-2 sm:col-span-1"
      />
      <Card
        role="group"
        aria-label={t('profilePage.stats.averages')}
        className="col-span-2 py-4 sm:col-span-3"
      >
        <CardContent className="px-4">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            {t('profilePage.stats.averages')}
          </p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {rates.map(({ key, value }) => (
              <div key={key} className="flex flex-col-reverse gap-0.5">
                <dt className="text-sm text-muted-foreground">{t(`profilePage.stats.${key}`)}</dt>
                <dd className="text-2xl font-bold tabular-nums">{average(value)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
