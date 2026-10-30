import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { addDays, type ToastOfTheWeek, ToastOfTheWeekStatus } from '@toasthub/shared';

import { InitialsAvatar } from '@/components/initials-avatar';
import { useFormat } from '@/i18n/format';

/** One drawn week: the winning photo and its owner, or why there is none (SPEC §4.10). */
export function TotwEntry({ entry }: { entry: ToastOfTheWeek }) {
  const { t } = useTranslation();
  const format = useFormat();
  const week = t('totw.week', {
    start: format.localDate(entry.weekStart, { day: 'numeric', month: 'short' }),
    end: format.localDate(addDays(entry.weekStart, 6), { dateStyle: 'medium' }),
  });

  if (entry.status !== ToastOfTheWeekStatus.won || !entry.toast) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{week}</p>
        <p className="text-muted-foreground">
          {entry.status === ToastOfTheWeekStatus.removed ? t('totw.removed') : t('totw.none')}
        </p>
      </div>
    );
  }

  const { user } = entry.toast;
  return (
    <div className="flex flex-col gap-3">
      <img
        src={entry.toast.photoUrl}
        alt={t('totw.photoAlt', { name: user.displayName })}
        loading="lazy"
        className="aspect-square w-full rounded-md bg-muted object-cover"
      />
      <div className="flex items-center gap-3">
        <InitialsAvatar name={user.displayName} avatarId={user.avatarId} size="sm" />
        <div className="flex min-w-0 flex-col">
          <Link to={`/u/${user.id}`} className="font-medium wrap-break-word hover:underline">
            {user.displayName}
          </Link>
          <span className="text-xs text-muted-foreground">{week}</span>
        </div>
      </div>
    </div>
  );
}
