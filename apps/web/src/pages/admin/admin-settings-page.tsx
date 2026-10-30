import { useQuery } from '@tanstack/react-query';
import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { type AppSettingKey, type AppSettings, appSettingsSchema } from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { PageHeader } from '@/components/page-header';
import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminSettingsQueryOptions, useUpdateSettings } from '@/features/admin/admin-api';

const KEYS = ['flagDailyThreshold', 'clanMaxMembers'] as const satisfies AppSettingKey[];

/** The bounds of a setting, from its shared schema. */
function bounds(key: AppSettingKey) {
  const field = appSettingsSchema.shape[key];
  return { min: field.minValue ?? 0, max: field.maxValue ?? Number.MAX_SAFE_INTEGER };
}

/** The flag threshold and the clan size limit (SPEC §4.13). */
export function AdminSettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery(adminSettingsQueryOptions);
  return (
    <>
      <PageHeader title={t('admin.nav.settings')} />
      {settings.isPending ? (
        <PageSpinner />
      ) : settings.isError ? (
        <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <Card className="max-w-xl">
          <CardContent>
            <SettingsForm initial={settings.data} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const { t } = useTranslation();
  const id = useId();
  const update = useUpdateSettings();
  const [values, setValues] = useState<Record<AppSettingKey, string>>({
    flagDailyThreshold: String(initial.flagDailyThreshold),
    clanMaxMembers: String(initial.clanMaxMembers),
  });
  const [invalid, setInvalid] = useState<AppSettingKey[]>([]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = appSettingsSchema.safeParse({
      flagDailyThreshold: Number(values.flagDailyThreshold),
      clanMaxMembers: Number(values.clanMaxMembers),
    });
    if (!parsed.success) {
      setInvalid(KEYS.filter((key) => parsed.error.issues.some((issue) => issue.path[0] === key)));
      return;
    }
    update.mutate(parsed.data);
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {KEYS.map((key) => {
        const { min, max } = bounds(key);
        const isInvalid = invalid.includes(key);
        return (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={`${id}-${key}`}>{t(`admin.settings.${key}`)}</Label>
            <Input
              id={`${id}-${key}`}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              className="max-w-32"
              value={values[key]}
              aria-invalid={isInvalid}
              aria-describedby={`${id}-${key}-hint`}
              onChange={(event) => {
                setValues({ ...values, [key]: event.target.value });
                setInvalid(invalid.filter((other) => other !== key));
                if (!update.isIdle) update.reset();
              }}
            />
            <p
              id={`${id}-${key}-hint`}
              className={isInvalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
            >
              {isInvalid
                ? t('admin.settings.invalid', { min, max })
                : t(`admin.settings.${key}Hint`, { min, max })}
            </p>
          </div>
        );
      })}
      <div className="flex flex-col items-start gap-3">
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t(errorMessageKey(update.error))}
          </p>
        )}
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {update.isSuccess && t('admin.settings.saved')}
        </p>
        <Button type="submit" disabled={update.isPending}>
          {t('admin.settings.save')}
        </Button>
      </div>
    </form>
  );
}
