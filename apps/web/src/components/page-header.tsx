import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/** A page's `<h1>`; also sets the browser tab title. */
export function PageHeader({ title, className }: { title: string; className?: string }) {
  const { t } = useTranslation();
  const appName = t('app.name');
  useEffect(() => {
    document.title = title === appName ? appName : `${title} · ${appName}`;
  }, [title, appName]);
  return <h1 className={cn('mb-6 text-2xl font-bold tracking-tight', className)}>{title}</h1>;
}
