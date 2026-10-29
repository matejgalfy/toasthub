import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { errorMessageKey } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HomeCards } from '@/features/home/home-cards';
import { homeQueryOptions } from '@/features/home/home-query';
import { LogToastButton } from '@/features/home/log-toast-button';

export function HomePage() {
  const { t } = useTranslation();
  const home = useQuery(homeQueryOptions);
  return (
    <>
      <PageHeader title={t('pages.home.title')} />
      <div className="flex flex-col gap-4">
        {/* Usable before the counters load: logging never waits for /home. */}
        <LogToastButton />
        <Button asChild variant="outline">
          <Link to="/toasts">
            <History aria-hidden="true" />
            {t('home.myToasts')}
          </Link>
        </Button>
        {home.isPending ? (
          <PageSpinner />
        ) : home.isError ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-4">
              <p role="alert">{t(errorMessageKey(home.error))}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void home.refetch();
                }}
              >
                {t('app.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <HomeCards home={home.data} />
        )}
      </div>
    </>
  );
}
