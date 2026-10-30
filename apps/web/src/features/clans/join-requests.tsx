import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { ClanJoinRequest } from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { UserAvatar } from '@/components/user-avatar';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';

import { clanRequestsQueryOptions, useDecideJoinRequest } from './clans-api';

/** Pending requests with approve and reject, for Officers and the Owner (SPEC §4.8). */
export function JoinRequests({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const titleId = useId();
  const requests = useQuery(clanRequestsQueryOptions(clanId));
  return (
    <Card role="region" aria-labelledby={titleId} className="gap-4">
      <CardHeader>
        <CardTitle>
          <h2 id={titleId}>{t('clans.requests.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.isPending ? (
          <PageSpinner className="min-h-16" />
        ) : requests.isError ? (
          <QueryError error={requests.error} onRetry={() => void requests.refetch()} />
        ) : requests.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('clans.requests.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.data.map((request) => (
              <li key={request.id}>
                <RequestRow clanId={clanId} request={request} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RequestRow({ clanId, request }: { clanId: string; request: ClanJoinRequest }) {
  const { t } = useTranslation();
  const format = useFormat();
  const decide = useDecideJoinRequest(clanId);
  const { user } = request;

  const run = (approve: boolean) => {
    decide.mutate(
      { requestId: request.id, approve },
      {
        onError: (error) => {
          // Full, or the request was cancelled or decided meanwhile.
          const conflict = error instanceof ApiError && error.status === 409;
          toast.error(conflict ? t('clans.requests.conflict') : t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <UserAvatar name={user.displayName} avatarId={user.avatarId} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/u/${user.id}`} className="font-medium wrap-break-word hover:underline">
          {user.displayName}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t('clans.requests.asked', { date: format.dateTime(request.createdAt) })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={decide.isPending}
          aria-label={t('clans.requests.approveLabel', { name: user.displayName })}
          onClick={() => {
            run(true);
          }}
        >
          <Check aria-hidden="true" />
          {t('clans.requests.approve')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={decide.isPending}
          aria-label={t('clans.requests.rejectLabel', { name: user.displayName })}
          onClick={() => {
            run(false);
          }}
        >
          <X aria-hidden="true" />
          {t('clans.requests.reject')}
        </Button>
      </div>
    </div>
  );
}
