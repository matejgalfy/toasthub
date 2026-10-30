import { useEffect, useState } from 'react';

/** How long a search box waits for typing to stop before it searches. */
export const SEARCH_DELAY_MS = 300;

/** `value`, once it has stopped changing for `delayMs` (search boxes). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}
