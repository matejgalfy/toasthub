import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';

import { PageHeader } from '@/components/page-header';
import { useUser } from '@/features/auth/session';
import { ClanForm } from '@/features/clans/clan-form';
import { useCreateClan } from '@/features/clans/clans-api';

/** Founding a clan; the founder becomes its Owner (SPEC §9 `/clans/new`, BR-CLAN-1). */
export function ClanNewPage() {
  const { t } = useTranslation();
  const me = useUser();
  const navigate = useNavigate();
  const create = useCreateClan();

  // One clan per user: a member has nothing to create here. Also where a successful create ends up,
  // once `/me` names the new clan.
  if (me.clanId && !create.isPending) return <Navigate to={`/clans/${me.clanId}`} replace />;

  return (
    <>
      <PageHeader title={t('pages.clanNew.title')} />
      <ClanForm
        withAvatar
        submitLabel={t('clans.form.create')}
        pending={create.isPending}
        error={create.error}
        onEdit={() => {
          if (create.isError) create.reset();
        }}
        onSubmit={(values) => {
          create.mutate(values, {
            onSuccess: ({ clan }) => void navigate(`/clans/${clan.id}`, { replace: true }),
          });
        }}
      />
    </>
  );
}
