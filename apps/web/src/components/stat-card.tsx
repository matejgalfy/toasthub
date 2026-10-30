import { useId, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** A big number with its label, unit and an optional hint (home counters, profile stats). */
export function StatCard({
  label,
  value,
  unit,
  hint,
  media,
  live = false,
  centered = false,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  /** A small picture before the label, such as the clan's. */
  media?: ReactNode;
  /** Announces a changed value to screen readers. */
  live?: boolean;
  /** Puts a bigger value in the middle of the card, level with its neighbours' (home streaks). */
  centered?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Card role="group" aria-labelledby={id} className={cn('gap-1 px-5 py-4', className)}>
      <div className={cn('flex items-center gap-2', centered && 'min-h-8')}>
        {media}
        <p id={id} className="text-sm font-medium text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className={cn(
          'flex items-baseline gap-1.5',
          centered && 'flex-1 items-center justify-center py-2',
        )}
        aria-live={live ? 'polite' : undefined}
      >
        <span className={cn('font-bold tabular-nums', centered ? 'text-5xl' : 'text-4xl')}>
          {value}
        </span>
        {unit && <span className="text-muted-foreground">{unit}</span>}
      </p>
      {hint && (
        <p className={cn('text-sm text-muted-foreground', centered && 'text-center')}>{hint}</p>
      )}
    </Card>
  );
}
