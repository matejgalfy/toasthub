import { type AchievementCondition, AchievementTrigger, localHour } from '@toasthub/shared';

/** The action that just happened. Each trigger only evaluates its own achievements. */
export type AchievementEvent =
  | { trigger: typeof AchievementTrigger.toast_logged; eatenAt: Date }
  | { trigger: typeof AchievementTrigger.clan_joined }
  | { trigger: typeof AchievementTrigger.totw_won };

/** The user's countable toasts after the event. */
export interface AchievementStats {
  toastCount: number;
  photoToastCount: number;
  longestStreak: number;
}

/** Whether checking the condition needs `AchievementStats`, which cost a few queries to load. */
export function needsStats(condition: AchievementCondition): boolean {
  return (
    condition.kind === 'toast_count' ||
    condition.kind === 'photo_toast_count' ||
    condition.kind === 'streak'
  );
}

export function isMet(
  condition: AchievementCondition,
  event: AchievementEvent,
  stats: AchievementStats,
): boolean {
  switch (condition.kind) {
    case 'toast_count':
      return stats.toastCount >= condition.min;
    case 'photo_toast_count':
      return stats.photoToastCount >= condition.min;
    // The longest run, not the current one, so a run that reached the length before it was evaluated
    // (older data, a failed evaluation) still earns it with the next toast.
    case 'streak':
      return stats.longestStreak >= condition.min;
    case 'local_hour': {
      if (event.trigger !== AchievementTrigger.toast_logged) return false;
      const hour = localHour(event.eatenAt);
      return condition.fromHour <= hour && hour < condition.toHour;
    }
    case 'clan_joined':
      return event.trigger === AchievementTrigger.clan_joined;
    case 'totw_won':
      return event.trigger === AchievementTrigger.totw_won;
  }
}
