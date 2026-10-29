import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Clan } from '@toasthub/shared';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';

import { ClanForm } from './clan-form';
import { useDeleteClan, useUpdateClan } from './clans-api';

/**
 * The Owner's settings: name and description, and deleting the clan (SPEC §4.8). Ownership is handed over
 * from a member's menu on the Members tab.
 */
export function ClanSettings({ clan }: { clan: Clan }) {
  const { t } = useTranslation();
  const update = useUpdateClan(clan.id);
  const remove = useDeleteClan(clan.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-10">
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
      <section className="flex flex-col items-start gap-3 border-t pt-6">
        <h2 className="font-semibold">{t('clans.settings.deleteHeading')}</h2>
        <p className="text-sm text-muted-foreground">{t('clans.settings.deleteHint')}</p>
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            remove.reset();
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t('clans.settings.delete')}
        </Button>
      </section>
      <ConfirmDialog
        open={confirming}
        onCancel={() => {
          setConfirming(false);
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
    </div>
  );
}
