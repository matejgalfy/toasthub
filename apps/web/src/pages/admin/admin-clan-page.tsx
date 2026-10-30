import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { type ClanDetail, ClanRole } from '@toasthub/shared';

import { ApiError } from '@/api/errors';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NativeSelect } from '@/components/native-select';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAdminDeleteClan, useAdminUpdateClan } from '@/features/admin/admin-api';
import { ClanForm } from '@/features/clans/clan-form';
import { clanQueryOptions } from '@/features/clans/clans-api';

/** `/admin/clans/:id`: edit, hand over or delete any clan (SPEC §4.13). */
export function AdminClanPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const clan = useQuery(clanQueryOptions(id));

  return (
    <div className="flex flex-col gap-2">
      <Link
        to="/admin/clans"
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('admin.clans.back')}
      </Link>
      {clan.isPending ? (
        <PageSpinner />
      ) : clan.isError ? (
        clan.error instanceof ApiError && clan.error.status === 404 ? (
          <p className="text-muted-foreground">{t('clans.notFound')}</p>
        ) : (
          <QueryError error={clan.error} onRetry={() => void clan.refetch()} />
        )
      ) : (
        <ClanAdmin detail={clan.data} />
      )}
    </div>
  );
}

function ClanAdmin({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const { clan } = detail;
  const update = useAdminUpdateClan(clan.id);
  const remove = useAdminDeleteClan(clan.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <PageHeader title={clan.name} className="mb-2 wrap-break-word" />
      <Link
        to={`/clans/${clan.id}`}
        className="mb-6 self-start text-sm text-primary hover:underline"
      >
        {t('admin.clans.open')}
      </Link>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-semibold">{t('admin.clans.edit')}</h2>
            <ClanForm
              initial={{ name: clan.name, description: clan.description }}
              submitLabel={t('clans.form.save')}
              pending={update.isPending}
              error={update.error}
              savedMessage={update.isSuccess && t('clans.form.saved')}
              onEdit={() => {
                if (!update.isIdle) update.reset();
              }}
              onSubmit={(values) => {
                update.mutate(values);
              }}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <OwnerCard detail={detail} />
          <Card>
            <CardContent className="flex flex-col items-start gap-3">
              <h2 className="font-semibold">{t('clans.settings.deleteHeading')}</h2>
              <p className="text-sm text-muted-foreground">{t('clans.settings.deleteHint')}</p>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  remove.reset();
                  setConfirmingDelete(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t('clans.settings.delete')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        onCancel={() => {
          setConfirmingDelete(false);
        }}
        onConfirm={() => {
          remove.mutate();
        }}
        title={t('clans.settings.deleteTitle', { name: clan.name })}
        description={t('clans.settings.deleteDescription')}
        confirmLabel={t('clans.settings.deleteConfirm')}
        pending={remove.isPending}
        error={remove.error}
      />
    </>
  );
}

/** The Owner and handing the clan to another member; the former Owner stays as an Officer (D52). */
function OwnerCard({ detail }: { detail: ClanDetail }) {
  const { t } = useTranslation();
  const id = useId();
  const transfer = useAdminUpdateClan(detail.clan.id);
  const owner = detail.members.find((member) => member.role === ClanRole.owner);
  const candidates = detail.members.filter((member) => member.role !== ClanRole.owner);
  const [picked, setPicked] = useState('');
  const [confirming, setConfirming] = useState(false);
  const target = candidates.find((member) => member.user.id === picked) ?? candidates[0];

  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3">
        <h2 className="font-semibold">{t('admin.clans.ownerHeading')}</h2>
        {owner && (
          <p className="text-sm">
            {t('admin.clans.currentOwner')}{' '}
            <Link to={`/u/${owner.user.id}`} className="font-medium hover:underline">
              {owner.user.displayName}
            </Link>
          </p>
        )}
        {target ? (
          <>
            <p className="text-sm text-muted-foreground">{t('admin.clans.ownerHint')}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-owner`}>{t('admin.clans.newOwner')}</Label>
                <NativeSelect
                  id={`${id}-owner`}
                  value={target.user.id}
                  onChange={(event) => {
                    setPicked(event.target.value);
                  }}
                >
                  {candidates.map((member) => (
                    <option key={member.user.id} value={member.user.id}>
                      {member.user.displayName} ({t(`clans.roles.${member.role}`)})
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  transfer.reset();
                  setConfirming(true);
                }}
              >
                {t('clans.members.transfer')}
              </Button>
            </div>
            <ConfirmDialog
              open={confirming}
              onCancel={() => {
                setConfirming(false);
              }}
              onConfirm={() => {
                transfer.mutate(
                  { ownerId: target.user.id },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                      setPicked('');
                      toast.success(
                        t('admin.clans.transferred', { name: target.user.displayName }),
                      );
                    },
                  },
                );
              }}
              title={t('admin.clans.transferTitle', {
                name: target.user.displayName,
                clan: detail.clan.name,
              })}
              description={t('admin.clans.transferDescription')}
              confirmLabel={t('clans.members.transferConfirm')}
              variant="default"
              pending={transfer.isPending}
              error={transfer.error}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('admin.clans.noOtherMembers')}</p>
        )}
      </CardContent>
    </Card>
  );
}
