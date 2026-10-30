import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { ToastsPerDay } from '@toasthub/shared';

import { useFormat } from '@/i18n/format';

/**
 * Toasts per day as columns over the last 30 days (`/admin/metrics`). One series, so one colour and no
 * legend; each column shows its day and count on hover, and the same numbers are in the table below.
 */
export function ToastsChart({ days }: { days: ToastsPerDay[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  const id = useId();
  const max = Math.max(0, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const first = days[0];
  const last = days.at(-1);
  const short = (date: string) => format.localDate(date, { day: 'numeric', month: 'short' });

  return (
    <figure aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <figcaption id={`${id}-title`} className="flex flex-col gap-1">
        <span className="font-semibold">{t('admin.metrics.chartTitle')}</span>
        <span className="text-sm text-muted-foreground">
          {t('admin.metrics.chartSummary', {
            total: format.number(total),
            max: format.number(max),
          })}
        </span>
      </figcaption>

      <div aria-hidden="true" className="flex gap-2">
        {/* The y axis: only the top and the baseline, so the grid stays quiet. */}
        <div className="flex h-48 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums">
          <span>{format.number(max)}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex h-48 items-end gap-0.5 border-t border-b border-dashed border-t-border border-b-foreground/40">
            {days.map((day) => (
              <div
                key={day.date}
                className="group relative flex h-full flex-1 items-end justify-center hover:bg-muted"
              >
                <div
                  className="w-full max-w-6 rounded-t-[4px] bg-primary"
                  style={{ height: max === 0 ? 0 : `${String((day.count / max) * 100)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm group-hover:block">
                  <strong className="tabular-nums">{format.number(day.count)}</strong>{' '}
                  {short(day.date)}
                </div>
              </div>
            ))}
          </div>
          {first && last && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{short(first.date)}</span>
              <span>{short(last.date)}</span>
            </div>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {t('admin.metrics.showTable')}
        </summary>
        <table className="mt-2 w-full max-w-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1 font-medium">
                {t('admin.metrics.date')}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t('admin.metrics.count')}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-t">
                <th scope="row" className="py-1 text-left font-normal">
                  {format.localDate(day.date)}
                </th>
                <td className="py-1 text-right tabular-nums">{format.number(day.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
