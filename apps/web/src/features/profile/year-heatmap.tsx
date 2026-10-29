import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type Heatmap, type LocalDate, localDate } from '@toasthub/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

import { type HeatLevel, heatmapMonths } from './heatmap';
import { heatmapQueryOptions } from './profile-api';
import { ProfileSection, QueryContent } from './profile-section';

// Literal class names so Tailwind finds them.
const HEAT_BACKGROUNDS: Record<HeatLevel, string> = {
  0: 'bg-muted',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
};
// Index = Monday-first offset of the month's 1st.
const COLUMN_STARTS = [
  'col-start-1',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
] as const;

const yearOf = (date: LocalDate) => Number(date.slice(0, 4));

/**
 * Toasts per day for one year, as twelve small month calendars so it fits a phone without scrolling.
 * Every day is an image with its date and count as the name, so screen readers get the same data.
 */
export function YearHeatmap({
  userId,
  firstToastDate,
}: {
  userId: string;
  firstToastDate: LocalDate | null | undefined;
}) {
  const { t } = useTranslation();
  const today = localDate(new Date());
  const currentYear = yearOf(today);
  const [year, setYear] = useState(currentYear);
  // Years before the first toast would be empty.
  const firstYear = firstToastDate ? Math.min(yearOf(firstToastDate), currentYear) : currentYear;
  const heatmap = useQuery(heatmapQueryOptions(userId, year));

  const yearSwitch = (
    <div role="group" aria-label={t('profilePage.heatmap.year')} className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('profilePage.heatmap.previousYear')}
        disabled={year <= firstYear}
        onClick={() => {
          setYear(year - 1);
        }}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="w-12 text-center font-medium tabular-nums" aria-live="polite">
        {year}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('profilePage.heatmap.nextYear')}
        disabled={year >= currentYear}
        onClick={() => {
          setYear(year + 1);
        }}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <ProfileSection title={t('profilePage.heatmap.title')} aside={yearSwitch}>
      <QueryContent query={heatmap}>
        {(data) => <HeatmapCard heatmap={data} today={today} loading={heatmap.isPlaceholderData} />}
      </QueryContent>
    </ProfileSection>
  );
}

function HeatmapCard({
  heatmap,
  today,
  loading,
}: {
  heatmap: Heatmap;
  today: LocalDate;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  // ~365 labels: build them once per year and language, not on every render.
  const months = useMemo(
    () =>
      heatmapMonths(heatmap, today).map((month) => ({
        ...month,
        name: format.localDate(month.start, { month: 'short' }),
        days: month.days.map((day) => ({
          ...day,
          label: t('profilePage.heatmap.day', {
            date: format.localDate(day.date, { dateStyle: 'long' }),
            toasts: t('toasts.count', { count: day.count }),
          }),
        })),
      })),
    [heatmap, today, format, t],
  );
  const total = heatmap.days.reduce((sum, day) => sum + day.count, 0);

  return (
    <Card className={cn('py-4 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
      <CardContent className="flex flex-col gap-4 px-4">
        <p className="text-sm text-muted-foreground">
          {t('profilePage.heatmap.summary', {
            toasts: t('toasts.count', { count: total }),
            year: heatmap.year,
          })}
        </p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">
          {months.map((month) => (
            <div key={month.start}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">{month.name}</h3>
              <ol className="grid grid-cols-7 gap-0.5">
                {month.days.map((day, index) => (
                  <li
                    key={day.date}
                    className={index === 0 ? COLUMN_STARTS[month.offset] : undefined}
                  >
                    <span
                      role="img"
                      aria-label={day.label}
                      title={day.label}
                      className={cn(
                        'block aspect-square rounded-[2px]',
                        HEAT_BACKGROUNDS[day.level],
                        day.future && 'opacity-40',
                      )}
                    />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <Legend />
      </CardContent>
    </Card>
  );
}

/** Each day names its own count, so the legend is only for sighted users. */
function Legend() {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-end gap-1 text-xs text-muted-foreground"
    >
      <span className="mr-1">{t('profilePage.heatmap.less')}</span>
      {([0, 1, 2, 3, 4] as const).map((level) => (
        <span key={level} className={cn('size-3 rounded-[2px]', HEAT_BACKGROUNDS[level])} />
      ))}
      <span className="ml-1">{t('profilePage.heatmap.more')}</span>
    </div>
  );
}
