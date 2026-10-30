import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { ADMIN_USER_SEARCH_MAX, type AdminUser, UserStatus } from '@toasthub/shared';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { LoadMore } from '@/components/load-more';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminUsersQueryOptions, useSetUserStatus } from '@/features/admin/admin-api';
import { useUser } from '@/features/auth/session';
import { useFormat } from '@/i18n/format';
import { SEARCH_DELAY_MS, useDebouncedValue } from '@/lib/use-debounced-value';

/** Every user, newest first, with a search by email or name, and ban / unban (SPEC §4.13). */
export function AdminUsersPage() {
  const { t } = useTranslation();
  const id = useId();
  const [input, setInput] = useState('');
  const search = useDebouncedValue(input.trim(), SEARCH_DELAY_MS);
  return (
    <>
      <PageHeader title={t('admin.nav.users')} />
      <div className="flex flex-col gap-4">
        <div role="search" className="flex max-w-md flex-col gap-2">
          <Label htmlFor={`${id}-search`}>{t('admin.users.search')}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={`${id}-search`}
              type="search"
              className="pl-9"
              maxLength={ADMIN_USER_SEARCH_MAX}
              placeholder={t('admin.users.searchPlaceholder')}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
              }}
            />
          </div>
        </div>
        <UserList search={search} />
      </div>
    </>
  );
}

function UserList({ search }: { search: string }) {
  const { t } = useTranslation();
  const users = useInfiniteQuery(adminUsersQueryOptions(search));
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = users;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (users.isPending) return <PageSpinner className="min-h-40" />;
  if (users.isError) {
    return <QueryError error={users.error} onRetry={() => void users.refetch()} />;
  }
  const items = users.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {search ? t('admin.users.noMatch', { search }) : t('admin.users.empty')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label={t('admin.users.listLabel')}
        aria-busy={users.isPlaceholderData}
        className="grid gap-3 xl:grid-cols-2"
      >
        {items.map((user) => (
          <li key={user.id}>
            <UserRow user={user} />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <LoadMore
          label={t('admin.users.loadMore')}
          onLoad={loadMore}
          loading={isFetchingNextPage}
        />
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  const format = useFormat();
  const me = useUser();
  const setStatus = useSetUserStatus();
  const [confirming, setConfirming] = useState(false);
  const banned = user.status === UserStatus.banned;
  // Someone who never finished onboarding has no name yet; the email tells them apart.
  const name = user.displayName ?? user.email;
  const next = banned ? UserStatus.active : UserStatus.banned;

  return (
    <Card className="h-full py-4">
      <CardContent className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar name={user.displayName} avatarId={user.avatarId} size="sm" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {user.displayName ? (
              <Link to={`/u/${user.id}`} className="font-medium wrap-break-word hover:underline">
                {user.displayName}
              </Link>
            ) : (
              <span className="text-muted-foreground italic">{t('admin.users.notOnboarded')}</span>
            )}
            <span className="text-sm break-all">{user.email}</span>
            <span className="text-sm text-muted-foreground">
              {[
                user.role === 'admin' && t('admin.users.admin'),
                user.clan?.name ?? t('admin.users.noClan'),
                t('admin.users.joined', {
                  date: format.dateTime(user.createdAt, { dateStyle: 'medium' }),
                }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {banned && (
              <span className="text-sm font-medium text-destructive">
                {t('admin.users.banned')}
              </span>
            )}
          </div>
        </div>
        {user.id === me.id ? (
          <span className="text-sm text-muted-foreground">{t('admin.users.you')}</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className={banned ? undefined : 'text-destructive'}
            aria-label={t(banned ? 'admin.users.unbanLabel' : 'admin.users.banLabel', { name })}
            onClick={() => {
              setStatus.reset();
              setConfirming(true);
            }}
          >
            {t(banned ? 'admin.users.unban' : 'admin.users.ban')}
          </Button>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setStatus.mutate(
            { id: user.id, status: next },
            {
              onSuccess: () => {
                setConfirming(false);
                toast.success(
                  t(banned ? 'admin.users.unbanned' : 'admin.users.bannedDone', { name }),
                );
              },
            },
          );
        }}
        title={t(banned ? 'admin.users.unbanTitle' : 'admin.users.banTitle', { name })}
        description={t(banned ? 'admin.users.unbanDescription' : 'admin.users.banDescription')}
        confirmLabel={t(banned ? 'admin.users.unban' : 'admin.users.ban')}
        variant={banned ? 'default' : 'destructive'}
        pending={setStatus.isPending}
        error={setStatus.error}
      />
    </Card>
  );
}
