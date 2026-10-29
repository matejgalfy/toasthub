import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/** A loading indicator; pass a smaller `min-h-*` for a section of a page. */
export function PageSpinner({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className={cn('flex min-h-[50dvh] items-center justify-center', className)}>
      <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );
}
