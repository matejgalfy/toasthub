import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageSpinner() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex min-h-[50dvh] items-center justify-center">
      <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );
}
