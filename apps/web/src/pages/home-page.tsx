import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
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
          <QueryError error={home.error} onRetry={() => void home.refetch()} />
        ) : (
          <HomeCards home={home.data} />
        )}
      </div>
    </>
  );
}
