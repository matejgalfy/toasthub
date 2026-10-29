import { Crown, EllipsisVertical, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import {
  canActOnMember,
  ClanRole,
  MemberAction,
  type ClanDetail,
  type ClanMember,
} from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/features/auth/session';

import { useChangeMemberRole, useKickMember, useTransferClan } from './clans-api';

/** An action that needs a confirmation first, and on whom. */
type Pending = { kind: 'kick' | 'transfer'; member: ClanMember } | null;

/** Members with their roles; the menu offers only what the caller's role allows (SPEC §3, D48). */
export function ClanMembers({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const me = useUser();
  const clanId = detail.clan.id;
  const changeRole = useChangeMemberRole(clanId);
  const kick = useKickMember(clanId);
  const transfer = useTransferClan(clanId);
  const [confirming, setConfirming] = useState<Pending>(null);

  const confirmation = confirming?.kind === 'kick' ? kick : transfer;
  const name = confirming?.member.user.displayName ?? '';

  return (
    <>
      <ul className="flex flex-col divide-y">
        {detail.members.map((member) => (
          <li key={member.user.id} className="flex items-center gap-3 py-3">
            <InitialsAvatar name={member.user.displayName} avatarId={member.user.avatarId} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                to={`/u/${member.user.id}`}
                className="font-medium wrap-break-word hover:underline"
              >
                {member.user.displayName}
              </Link>
              <span className="text-sm text-muted-foreground">
                {t(`clans.roles.${member.role}`)}
              </span>
            </div>
            <MemberMenu
              actor={detail.myRole}
              member={member}
              self={member.user.id === me.id}
              disabled={changeRole.isPending}
              onRoleChange={(role) => {
                changeRole.mutate(
                  { userId: member.user.id, role },
                  {
                    onError: (error) => {
                      toast.error(t(errorMessageKey(error)));
                    },
                  },
                );
              }}
              onConfirm={(kind) => {
                kick.reset();
                transfer.reset();
                setConfirming({ kind, member });
              }}
            />
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => {
          setConfirming(null);
        }}
        onConfirm={() => {
          if (!confirming) return;
          confirmation.mutate(
            { userId: confirming.member.user.id },
            {
              onSuccess: () => {
                setConfirming(null);
              },
            },
          );
        }}
        title={t(`clans.members.${confirming?.kind ?? 'kick'}Title`, { name })}
        description={t(`clans.members.${confirming?.kind ?? 'kick'}Description`, { name })}
        confirmLabel={t(`clans.members.${confirming?.kind ?? 'kick'}Confirm`)}
        pending={confirmation.isPending}
        error={confirmation.error}
        variant={confirming?.kind === 'transfer' ? 'default' : 'destructive'}
      />
    </>
  );
}

function MemberMenu({
  actor,
  member,
  self,
  disabled,
  onRoleChange,
  onConfirm,
}: {
  actor: ClanRole | null;
  member: ClanMember;
  self: boolean;
  disabled: boolean;
  onRoleChange: (role: 'officer' | 'member') => void;
  onConfirm: (kind: 'kick' | 'transfer') => void;
}) {
  const { t } = useTranslation();
  const may = (action: MemberAction) => canActOnMember(actor, action, member.role, self);
  const canChangeRole = may(MemberAction.changeRole);
  const canTransfer = may(MemberAction.transferOwnership);
  const canKick = may(MemberAction.kick);
  if (!canChangeRole && !canTransfer && !canKick) return null;

  return (
    // Not modal: a modal menu that opens a dialog can leave the page unclickable (Radix).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={t('clans.members.actions', { name: member.user.displayName })}
        >
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canChangeRole &&
          (member.role === ClanRole.member ? (
            <DropdownMenuItem
              onSelect={() => {
                onRoleChange(ClanRole.officer);
              }}
            >
              <ShieldCheck aria-hidden="true" />
              {t('clans.members.promote')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                onRoleChange(ClanRole.member);
              }}
            >
              <ShieldOff aria-hidden="true" />
              {t('clans.members.demote')}
            </DropdownMenuItem>
          ))}
        {canTransfer && (
          <DropdownMenuItem
            onSelect={() => {
              onConfirm('transfer');
            }}
          >
            <Crown aria-hidden="true" />
            {t('clans.members.transfer')}
          </DropdownMenuItem>
        )}
        {canKick && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              onConfirm('kick');
            }}
          >
            <UserMinus aria-hidden="true" />
            {t('clans.members.kick')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
