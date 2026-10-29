import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';

export type PlaceholderPageName =
  'leaderboards' | 'clans' | 'clanNew' | 'clan' | 'toastOfTheWeek' | 'admin';

/** Stands in for a page until its milestone builds it (see docs/PLAN.md). */
export function PlaceholderPage({ page }: { page: PlaceholderPageName }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(`pages.${page}.title`)} />
      <Card>
        <CardContent>
          <p className="text-muted-foreground">{t('placeholder.body')}</p>
        </CardContent>
      </Card>
    </>
  );
}
