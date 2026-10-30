import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Period } from '@toasthub/shared';

import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

/** One row of a board, whatever it ranks. */
export interface RankEntry {
  id: string;
  rank: number;
  name: string;
  href: string;
  count: number;
  /** A user's avatar; clans have none. */
  avatarId?: number | null;
  /** The clan's current streak, on clan rows only. */
  streak?: number;
}

const PERIODS = [Period.week, Period.month, Period.year] as const;

/** This week / month / year, as a row of toggle buttons. */
export function PeriodSwitch({
  value,
  onChange,
}: {
  value: Period;
  onChange: (period: Period) => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('leaderboards.period.label')} className="flex gap-2">
      {PERIODS.map((period) => (
        <Button
          key={period}
          size="sm"
          variant={period === value ? 'default' : 'outline'}
          aria-pressed={period === value}
          onClick={() => {
            onChange(period);
          }}
        >
          {t(`leaderboards.period.${period}`)}
        </Button>
      ))}
    </div>
  );
}

/** The board in rank order; the caller's own row (`mineId`) stands out. */
export function RankList({
  entries,
  mineId,
  label,
}: {
  entries: RankEntry[];
  mineId?: string | null;
  label: string;
}) {
  return (
    // Ties share a rank, so the numbers are drawn by the rows, not by the list.
    <ol aria-label={label} className="flex list-none flex-col divide-y">
      {entries.map((entry) => (
        <li key={entry.id}>
          <RankRow entry={entry} mine={entry.id === mineId} />
        </li>
      ))}
    </ol>
  );
}

/**
 * The caller's own row (or their clan's), shown above the board so it stays in view even below the top 50.
 * `hint` stands in when there is no row: no toast in the period yet.
 */
export function PinnedRank({
  title,
  entry,
  hint,
}: {
  title: string;
  entry: RankEntry | null;
  hint: ReactNode;
}) {
  const id = useId();
  return (
    <Card role="group" aria-labelledby={id} className="gap-0 px-4 py-3">
      <p id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </p>
      {entry ? <RankRow entry={entry} mine={false} /> : <p className="pt-1 text-sm">{hint}</p>}
    </Card>
  );
}

function RankRow({ entry, mine }: { entry: RankEntry; mine: boolean }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <div
      className={cn('flex items-center gap-3 py-3', mine && '-mx-2 rounded-md bg-accent px-2')}
      aria-current={mine ? 'true' : undefined}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
          entry.rank <= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        <span className="sr-only">{t('leaderboards.rank')} </span>
        {format.number(entry.rank)}
      </span>
      {entry.avatarId !== undefined && (
        <UserAvatar name={entry.name} avatarId={entry.avatarId} size="sm" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={entry.href} className="font-medium wrap-break-word hover:underline">
          {entry.name}
        </Link>
        {entry.streak !== undefined && (
          <span className="text-sm text-muted-foreground">
            <span aria-hidden="true">🔥 {format.number(entry.streak)}</span>
            <span className="sr-only">
              {t('leaderboards.streak', {
                count: entry.streak,
                value: format.number(entry.streak),
              })}
            </span>
          </span>
        )}
      </div>
      <span className="flex items-baseline gap-1 text-right">
        <span className="text-lg font-semibold tabular-nums">{format.number(entry.count)}</span>{' '}
        <span className="text-sm text-muted-foreground">
          {t('home.today.unit', { count: entry.count })}
        </span>
      </span>
    </div>
  );
}
