import { Clock, LogOut, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { ClanDetail } from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { ClanAvatar } from '@/components/clan-avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { useUser } from '@/features/auth/session';
import { useFormat } from '@/i18n/format';

import { useCancelJoinRequest, useJoinClan, useLeaveClan } from './clans-api';

/** Picture, name, description, member count, the clan streak and the caller's way in or out (SPEC §9 `/clans/:id`). */
export function ClanHeader({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { clan, streak } = detail;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ClanAvatar name={clan.name} avatarId={clan.avatarId} size="lg" decorative />
        <div className="flex min-w-0 flex-col gap-1">
          <PageHeader title={clan.name} className="mb-0 wrap-break-word" />
          <p className="text-sm text-muted-foreground">
            {t('clans.memberCount', { count: clan.memberCount })}
          </p>
        </div>
      </div>
      {clan.description && (
        <p className="wrap-break-word whitespace-pre-line">{clan.description}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={t('clans.streak.current')}
          value={format.number(streak.current)}
          unit={t('home.streak.unit', { count: streak.current })}
        />
        <StatCard
          label={t('clans.streak.longest')}
          value={format.number(streak.longest)}
          unit={t('home.streak.unit', { count: streak.longest })}
        />
      </div>
      <MembershipAction detail={detail} />
    </div>
  );
}

function MembershipAction({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const me = useUser();
  const { clan, myRole, myRequest } = detail;

  // BR-CLAN-4: the Owner hands the clan over or deletes it instead.
  if (myRole === 'owner') {
    return <p className="text-sm text-muted-foreground">{t('clans.leave.ownerHint')}</p>;
  }
  if (myRole !== null) return <LeaveButton clanId={clan.id} clanName={clan.name} />;
  if (myRequest !== null) return <PendingRequest />;
  if (me.clanId !== null && me.clanId !== clan.id) {
    return <p className="text-sm text-muted-foreground">{t('clans.join.inOtherClan')}</p>;
  }
  return <JoinButton clanId={clan.id} />;
}

function JoinButton({ clanId }: { clanId: string }) {
  const { t } = useTranslation();
  const join = useJoinClan(clanId);
  return (
    <Button
      size="lg"
      disabled={join.isPending}
      onClick={() => {
        join.mutate(undefined, {
          onError: (error) => {
            // Already in a clan, waiting on another request, or the clan is full (D47).
            const conflict = error instanceof ApiError && error.status === 409;
            toast.error(conflict ? t('clans.join.conflict') : t(errorMessageKey(error)));
          },
        });
      }}
    >
      <UserPlus aria-hidden="true" />
      {t('clans.join.request')}
    </Button>
  );
}

function PendingRequest() {
  const { t } = useTranslation();
  const cancel = useCancelJoinRequest();
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg bg-muted p-4">
      <p className="flex items-center gap-2 text-sm">
        <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {t('clans.join.pending')}
      </p>
      <Button
        variant="outline"
        disabled={cancel.isPending}
        onClick={() => {
          cancel.mutate(undefined, {
            onError: (error) => {
              toast.error(t(errorMessageKey(error)));
            },
          });
        }}
      >
        <X aria-hidden="true" />
        {t('clans.join.cancel')}
      </Button>
    </div>
  );
}

function LeaveButton({ clanId, clanName }: { clanId: string; clanName: string }) {
  const { t } = useTranslation();
  const leave = useLeaveClan(clanId);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => {
          leave.reset();
          setOpen(true);
        }}
      >
        <LogOut aria-hidden="true" />
        {t('clans.leave.button')}
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          leave.mutate(undefined, {
            onSuccess: () => {
              setOpen(false);
            },
          });
        }}
        title={t('clans.leave.title', { name: clanName })}
        description={t('clans.leave.description')}
        confirmLabel={t('clans.leave.confirm')}
        pending={leave.isPending}
        error={leave.error}
      />
    </>
  );
}
