import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export function LandingPage() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-center gap-4 pt-10 text-center">
      <span aria-hidden="true" className="text-7xl">
        🍞
      </span>
      <PageHeader title={t('pages.landing.title')} className="mb-0 text-4xl" />
      <p className="max-w-sm text-lg text-muted-foreground">{t('pages.landing.tagline')}</p>
      <Button asChild size="lg" className="mt-4">
        <Link to="/login">{t('pages.landing.cta')}</Link>
      </Button>
    </section>
  );
}
