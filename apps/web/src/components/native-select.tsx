import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** A plain `<select>` styled like `Input`: the browser's own picker, which suits short option lists. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
