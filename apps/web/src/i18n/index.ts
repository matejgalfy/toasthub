import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { Locale, localeSchema } from '@toasthub/shared';

import en from './en.json';
import sk from './sk.json';

export const resources = { en: { translation: en }, sk: { translation: sk } } as const;

export const LOCALES = [Locale.sk, Locale.en] as const;

// The device's choice until M5 syncs it with the user's `locale` from /me.
const STORAGE_KEY = 'toasthub.locale';

/** Stored choice first, then the browser languages; Slovak only for `sk*`, English otherwise. */
export function detectLocale(stored: string | null, browserLanguages: readonly string[]): Locale {
  const parsed = localeSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  const preferred = browserLanguages.find((tag) => /^(sk|en)\b/i.test(tag));
  return preferred?.toLowerCase().startsWith('sk') ? Locale.sk : Locale.en;
}

function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function initI18n(locale = detectLocale(readStoredLocale(), navigator.languages)) {
  i18next.on('languageChanged', (language) => {
    document.documentElement.lang = language;
  });
  return i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: Locale.en,
    supportedLngs: LOCALES,
    initAsync: false,
    interpolation: { escapeValue: false },
  });
}

export async function changeLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the switch still applies to this visit.
  }
  await i18next.changeLanguage(locale);
}

/** The active UI locale. */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  const parsed = localeSchema.safeParse(i18n.resolvedLanguage);
  return parsed.success ? parsed.data : Locale.en;
}
