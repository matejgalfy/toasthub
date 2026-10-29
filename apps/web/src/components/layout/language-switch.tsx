import { useTranslation } from 'react-i18next';

import { useChangeLocale } from '@/features/account/use-update-me';
import { LOCALES, useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const current = useLocale();
  const changeLocale = useChangeLocale();
  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn('inline-flex rounded-md border p-0.5', className)}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          onClick={() => {
            changeLocale(locale);
          }}
          className="min-w-9 rounded-sm px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-secondary aria-pressed:text-secondary-foreground"
        >
          {locale.toUpperCase()}
          <span className="sr-only"> {t(`language.${locale}`)}</span>
        </button>
      ))}
    </div>
  );
}
