import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('pages.notFound.title')} />
      <p className="mb-6 text-muted-foreground">{t('pages.notFound.body')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('pages.notFound.back')}</Link>
      </Button>
    </>
  );
}
