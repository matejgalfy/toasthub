import { useId } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** A big number with its label, unit and an optional hint (home counters, profile stats). */
export function StatCard({
  label,
  value,
  unit,
  hint,
  live = false,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  /** Announces a changed value to screen readers. */
  live?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Card role="group" aria-labelledby={id} className={cn('gap-1 px-5 py-4', className)}>
      <p id={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </p>
      <p className="flex items-baseline gap-1.5" aria-live={live ? 'polite' : undefined}>
        <span className="text-4xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </Card>
  );
}
