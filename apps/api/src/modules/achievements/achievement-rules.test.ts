import { ACHIEVEMENTS, type AchievementCode } from '@toasthub/shared';
import { describe, expect, it } from 'vitest';

import { type AchievementEvent, type AchievementStats, isMet } from './achievement-rules';

const NO_TOASTS: AchievementStats = { toastCount: 0, photoToastCount: 0, longestStreak: 0 };
// 12:00 in Bratislava (CET, UTC+1): no time-of-day achievement.
const NOON = new Date('2026-10-29T11:00:00Z');

function toastLogged(stats: Partial<AchievementStats>, eatenAt = NOON): AchievementCode[] {
  return earned({ trigger: 'toast_logged', eatenAt }, { ...NO_TOASTS, ...stats });
}

/** What the evaluator would award for the event, in display order. */
function earned(event: AchievementEvent, stats: AchievementStats): AchievementCode[] {
  return ACHIEVEMENTS.filter(
    (achievement) =>
      achievement.trigger === event.trigger && isMet(achievement.condition, event, stats),
  ).map((achievement) => achievement.code);
}

describe('toast_logged achievements', () => {
  it('first_bite: the first countable toast', () => {
    expect(toastLogged({ toastCount: 1, longestStreak: 1 })).toEqual(['first_bite']);
    expect(toastLogged({ toastCount: 0 })).toEqual([]);
  });

  it('shutterbug: the first toast with a photo', () => {
    expect(toastLogged({ toastCount: 3, photoToastCount: 1, longestStreak: 1 })).toEqual([
      'first_bite',
      'shutterbug',
    ]);
  });

  it('week_warrior and toast_devotee: a 7-day and a 30-day streak', () => {
    const base = { toastCount: 40 };
    expect(toastLogged({ ...base, longestStreak: 6 })).not.toContain('week_warrior');
    expect(toastLogged({ ...base, longestStreak: 7 })).toContain('week_warrior');
    expect(toastLogged({ ...base, longestStreak: 29 })).not.toContain('toast_devotee');
    expect(toastLogged({ ...base, longestStreak: 30 })).toEqual(
      expect.arrayContaining(['week_warrior', 'toast_devotee']),
    );
  });

  it('centurion and toastmaster: 100 and 1,000 toasts', () => {
    expect(toastLogged({ toastCount: 99 })).toEqual(['first_bite']);
    expect(toastLogged({ toastCount: 100 })).toEqual(['first_bite', 'centurion']);
    expect(toastLogged({ toastCount: 999 })).not.toContain('toastmaster');
    expect(toastLogged({ toastCount: 1000 })).toEqual(['first_bite', 'centurion', 'toastmaster']);
  });

  it('early_bird: logged before 07:00 local time', () => {
    const at = (iso: string) => toastLogged({ toastCount: 2 }, new Date(iso));
    expect(at('2026-10-29T05:59:59Z')).toContain('early_bird'); // 06:59:59 CET
    expect(at('2026-10-29T06:00:00Z')).not.toContain('early_bird'); // 07:00 CET
    expect(at('2026-07-01T04:30:00Z')).toContain('early_bird'); // 06:30 CEST
    expect(at('2026-07-01T05:00:00Z')).not.toContain('early_bird'); // 07:00 CEST
  });

  it('midnight_snack: logged between 00:00 and 03:59 local time', () => {
    const at = (iso: string) => toastLogged({ toastCount: 2 }, new Date(iso));
    expect(at('2026-10-28T22:59:59Z')).toEqual(['first_bite']); // 23:59:59 CET
    expect(at('2026-10-28T23:00:00Z')).toEqual(['first_bite', 'early_bird', 'midnight_snack']);
    expect(at('2026-10-29T02:59:59Z')).toContain('midnight_snack'); // 03:59:59 CET
    expect(at('2026-10-29T03:00:00Z')).toEqual(['first_bite', 'early_bird']); // 04:00 CET
  });

  it('never awards achievements of other triggers', () => {
    expect(toastLogged({ toastCount: 1 })).not.toContain('clansman');
    expect(toastLogged({ toastCount: 1 })).not.toContain('golden_toast');
  });
});

describe('other triggers', () => {
  it('clansman: joining a clan', () => {
    expect(earned({ trigger: 'clan_joined' }, NO_TOASTS)).toEqual(['clansman']);
  });

  it('golden_toast: winning the Toast of the week', () => {
    expect(earned({ trigger: 'totw_won' }, NO_TOASTS)).toEqual(['golden_toast']);
  });
});
