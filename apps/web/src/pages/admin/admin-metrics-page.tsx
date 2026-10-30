import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { StatCard } from '@/components/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { adminMetricsQueryOptions } from '@/features/admin/admin-api';
import { ToastsChart } from '@/features/admin/toasts-chart';
import { useFormat } from '@/i18n/format';

/** Users, today's active users, open flags and toasts per day over 30 days (SPEC §4.13). */
export function AdminMetricsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const metrics = useQuery(adminMetricsQueryOptions);
  return (
    <>
      <PageHeader title={t('admin.nav.metrics')} />
      {metrics.isPending ? (
        <PageSpinner />
      ) : metrics.isError ? (
        <QueryError error={metrics.error} onRetry={() => void metrics.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t('admin.metrics.users')} value={format.number(metrics.data.users)} />
            <StatCard label={t('admin.metrics.dau')} value={format.number(metrics.data.dau)} />
            <StatCard
              label={t('admin.metrics.openFlags')}
              value={format.number(metrics.data.openFlags)}
            />
          </div>
          <Card>
            <CardContent>
              <ToastsChart days={metrics.data.toastsPerDay} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
