import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { type AdminFlag, type FlagAction, FlagType } from '@toasthub/shared';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUser } from '@/features/auth/session';
import { useFormat } from '@/i18n/format';

import { useResolveFlag } from './admin-api';
import { canBanSubject, flagActionChoices } from './flag-actions';

/** One flag in the queue: who and what it is about, how it ended, and "Resolve" while open. */
export function FlagCard({ flag }: { flag: AdminFlag }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [resolving, setResolving] = useState(false);
  const subjectName = flag.subject.displayName;

  return (
    <Card className="h-full gap-4 py-4">
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{t(`admin.flags.types.${flag.type}`)}</p>
          <p className="text-sm text-muted-foreground">
            {t(`admin.flags.statuses.${flag.status}`)} ·{' '}
            {t('admin.flags.created', { date: format.dateTime(flag.createdAt) })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <InitialsAvatar name={subjectName} avatarId={flag.subject.avatarId} size="sm" />
          <div className="flex min-w-0 flex-col">
            <Link
              to={`/u/${flag.subject.id}`}
              className="font-medium wrap-break-word hover:underline"
            >
              {subjectName}
            </Link>
            {flag.subject.status === 'banned' && (
              <span className="text-sm text-destructive">{t('admin.flags.banned')}</span>
            )}
          </div>
        </div>

        {flag.type === FlagType.count_threshold && flag.localDate && flag.day && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('admin.flags.day')}</dt>
            <dd>{format.localDate(flag.localDate, { dateStyle: 'full' })}</dd>
            <dt className="text-muted-foreground">{t('admin.flags.counting')}</dt>
            <dd className="tabular-nums">{format.number(flag.day.active)}</dd>
            <dt className="text-muted-foreground">{t('admin.flags.rejected')}</dt>
            <dd className="tabular-nums">{format.number(flag.day.rejected)}</dd>
          </dl>
        )}

        {flag.type === FlagType.photo_report && <ReportDetails flag={flag} />}

        {flag.resolvedAt && (
          <p className="text-sm text-muted-foreground">
            {t('admin.flags.resolvedBy', {
              name: flag.resolvedBy?.displayName ?? t('admin.flags.someone'),
              date: format.dateTime(flag.resolvedAt),
            })}
          </p>
        )}

        {flagActionChoices(flag).length > 0 && (
          <Button
            className="self-start"
            aria-label={t('admin.flags.resolveLabel', { name: subjectName })}
            onClick={() => {
              setResolving(true);
            }}
          >
            {t('admin.flags.resolve')}
          </Button>
        )}
      </CardContent>
      {resolving && (
        <ResolveDialog
          flag={flag}
          onClose={() => {
            setResolving(false);
          }}
        />
      )}
    </Card>
  );
}

/** The reported photo (also when hidden), its toast's state, earlier photos and the report itself. */
function ReportDetails({ flag }: { flag: AdminFlag }) {
  const { t } = useTranslation();
  const format = useFormat();
  const reported = flag.toast;
  return (
    <div className="flex flex-col gap-3">
      {reported?.photoUrl ? (
        <img
          src={reported.photoUrl}
          alt={t('admin.flags.photoAlt', { name: flag.subject.displayName })}
          loading="lazy"
          className="aspect-square w-full max-w-72 rounded-md bg-muted object-cover"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('admin.flags.noPhoto')}</p>
      )}
      {reported && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li>{format.dateTime(reported.eatenAt)}</li>
          {reported.photoHidden && <li>{t('admin.flags.photoHidden')}</li>}
          {reported.status === 'rejected' && <li>{t('admin.flags.toastRejected')}</li>}
          {reported.deleted && <li>{t('admin.flags.toastDeleted')}</li>}
        </ul>
      )}
      {reported && reported.earlierPhotoUrls.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('admin.flags.earlierPhotos')}</p>
          <ul className="flex flex-wrap gap-2">
            {reported.earlierPhotoUrls.map((url, index) => (
              <li key={url}>
                <img
                  src={url}
                  alt={t('admin.flags.earlierPhotoAlt', { number: index + 1 })}
                  loading="lazy"
                  className="size-20 rounded-md bg-muted object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm">
        {flag.reporter
          ? t('admin.flags.reportedBy', { name: flag.reporter.displayName })
          : t('admin.flags.reportedByDeleted')}
      </p>
      <p className="text-sm wrap-break-word text-muted-foreground">
        {flag.reason ? t('admin.flags.reason', { reason: flag.reason }) : t('admin.flags.noReason')}
      </p>
    </div>
  );
}

function ResolveDialog({ flag, onClose }: { flag: AdminFlag; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const me = useUser();
  const resolve = useResolveFlag();
  const choices = flagActionChoices(flag);
  const [action, setAction] = useState<FlagAction>('dismiss');
  const [ban, setBan] = useState(false);
  const name = flag.subject.displayName;

  return (
    <ConfirmDialog
      open
      onCancel={onClose}
      onConfirm={() => {
        resolve.mutate(
          { id: flag.id, body: { action, ban } },
          {
            onSuccess: () => {
              toast.success(t('admin.flags.dialog.done'));
              onClose();
            },
          },
        );
      }}
      title={t('admin.flags.dialog.title', { name })}
      description={t(`admin.flags.dialog.description.${flag.type}`)}
      confirmLabel={t('admin.flags.dialog.confirm')}
      pending={resolve.isPending}
      error={resolve.error}
      variant="default"
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">{t('admin.flags.dialog.action')}</legend>
        <RadioGroup
          value={action}
          onValueChange={(value) => {
            const choice = choices.find((option) => option.action === value);
            if (choice) setAction(choice.action);
          }}
        >
          {choices.map((choice) => (
            <div key={choice.action} className="flex items-start gap-3">
              <RadioGroupItem
                id={`${id}-${choice.action}`}
                value={choice.action}
                aria-describedby={`${id}-${choice.action}-hint`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-${choice.action}`}>
                  {t(`admin.flags.actions.${choice.label}`)}
                </Label>
                <p id={`${id}-${choice.action}-hint`} className="text-sm text-muted-foreground">
                  {t(`admin.flags.actions.${choice.label}Hint`)}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      {canBanSubject(flag, me.id) && (
        <div className="flex items-start gap-3">
          <input
            id={`${id}-ban`}
            type="checkbox"
            checked={ban}
            aria-describedby={`${id}-ban-hint`}
            onChange={(event) => {
              setBan(event.target.checked);
            }}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-ban`}>{t('admin.flags.dialog.ban', { name })}</Label>
            <p id={`${id}-ban-hint`} className="text-sm text-muted-foreground">
              {t('admin.flags.dialog.banHint')}
            </p>
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
}
