import { z } from 'zod';

// The fixed list from SPEC §4.12. The DB only accepts these codes (a check on `user_achievement`), so
// adding or removing one needs a migration.
export const AchievementCode = {
  first_bite: 'first_bite',
  shutterbug: 'shutterbug',
  week_warrior: 'week_warrior',
  toast_devotee: 'toast_devotee',
  centurion: 'centurion',
  toastmaster: 'toastmaster',
  clansman: 'clansman',
  golden_toast: 'golden_toast',
  early_bird: 'early_bird',
  midnight_snack: 'midnight_snack',
} as const;
export const achievementCodeSchema = z.enum(AchievementCode);
export type AchievementCode = z.infer<typeof achievementCodeSchema>;

/** The action after which achievements are evaluated (synchronously, SPEC §4.12). */
export const AchievementTrigger = {
  toast_logged: 'toast_logged',
  clan_joined: 'clan_joined',
  totw_won: 'totw_won',
} as const;
export type AchievementTrigger = (typeof AchievementTrigger)[keyof typeof AchievementTrigger];

/** What the evaluator checks. Counts and streaks only include countable toasts. */
export type AchievementCondition =
  | { kind: 'toast_count'; min: number }
  | { kind: 'photo_toast_count'; min: number }
  | { kind: 'streak'; min: number }
  // Local (Europe/Bratislava) hour of the logged toast: `fromHour <= hour < toHour`.
  | { kind: 'local_hour'; fromHour: number; toHour: number }
  | { kind: 'clan_joined' }
  | { kind: 'totw_won' };

export interface AchievementDefinition {
  code: AchievementCode;
  trigger: AchievementTrigger;
  condition: AchievementCondition;
  /** i18n keys; the web has the SK and EN text. */
  nameKey: string;
  descriptionKey: string;
}

function define(
  code: AchievementCode,
  trigger: AchievementTrigger,
  condition: AchievementCondition,
): AchievementDefinition {
  return {
    code,
    trigger,
    condition,
    nameKey: `achievements.${code}.name`,
    descriptionKey: `achievements.${code}.description`,
  };
}

const { toast_logged, clan_joined, totw_won } = AchievementTrigger;

/** In display order. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  define('first_bite', toast_logged, { kind: 'toast_count', min: 1 }),
  define('shutterbug', toast_logged, { kind: 'photo_toast_count', min: 1 }),
  define('week_warrior', toast_logged, { kind: 'streak', min: 7 }),
  define('toast_devotee', toast_logged, { kind: 'streak', min: 30 }),
  define('centurion', toast_logged, { kind: 'toast_count', min: 100 }),
  define('toastmaster', toast_logged, { kind: 'toast_count', min: 1000 }),
  define('clansman', clan_joined, { kind: 'clan_joined' }),
  define('golden_toast', totw_won, { kind: 'totw_won' }),
  define('early_bird', toast_logged, { kind: 'local_hour', fromHour: 0, toHour: 7 }),
  define('midnight_snack', toast_logged, { kind: 'local_hour', fromHour: 0, toHour: 4 }),
];

export function achievementsFor(trigger: AchievementTrigger): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((achievement) => achievement.trigger === trigger);
}
