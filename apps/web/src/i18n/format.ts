import { useMemo } from 'react';

import { TIME_ZONE, type LocalDate, type Locale } from '@toasthub/shared';

import { useLocale } from './index';

// en-GB rather than en-US: day-month order and a 24-hour clock, like the Slovak format.
const INTL_LOCALE: Record<Locale, string> = { sk: 'sk-SK', en: 'en-GB' };

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

/** An instant (API timestamp), shown in Europe/Bratislava time whatever the device's zone (SPEC D2). */
export function formatDateTime(
  value: Date | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: TIME_ZONE }).format(
    date,
  );
}

/** A calendar day (`YYYY-MM-DD`), which has no zone: format it as UTC noon in UTC so it can't shift. */
export function formatLocalDate(
  date: LocalDate,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** The formatters bound to the active UI locale. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      dateTime: (value: Date | string, options?: Intl.DateTimeFormatOptions) =>
        formatDateTime(value, locale, options),
      localDate: (date: LocalDate, options?: Intl.DateTimeFormatOptions) =>
        formatLocalDate(date, locale, options),
    }),
    [locale],
  );
}
