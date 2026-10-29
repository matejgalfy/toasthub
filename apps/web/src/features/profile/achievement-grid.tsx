import { Award, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { UserAchievement } from '@toasthub/shared';

import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

/**
 * Every achievement in display order: earned ones with their date, locked ones greyed out. Locked text
 * keeps the muted colour rather than lowered opacity, so it still meets AA contrast.
 */
export function AchievementGrid({ achievements }: { achievements: UserAchievement[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  const earned = achievements.filter((achievement) => achievement.earnedAt !== null).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {t('profilePage.achievements.summary', { earned, total: achievements.length })}
      </p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {achievements.map(({ code, earnedAt }) => (
          <li
            key={code}
            className={cn(
              'flex flex-col gap-1 rounded-lg border p-3',
              earnedAt ? 'bg-card' : 'border-dashed bg-muted text-muted-foreground',
            )}
          >
            {earnedAt ? (
              <Award className="size-6 text-primary" aria-hidden="true" />
            ) : (
              <Lock className="size-6" aria-hidden="true" />
            )}
            <span className="font-medium">{t(`achievements.${code}.name`)}</span>
            <span className={cn('text-sm', earnedAt && 'text-muted-foreground')}>
              {t(`achievements.${code}.description`)}
            </span>
            <span className="mt-auto pt-1 text-xs font-medium">
              {earnedAt
                ? t('profilePage.achievements.earned', {
                    date: format.dateTime(earnedAt, { dateStyle: 'medium' }),
                  })
                : t('profilePage.achievements.locked')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
