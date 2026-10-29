import { describe, expect, it } from 'vitest';

import { ACHIEVEMENTS, AchievementCode, achievementsFor } from './achievements.js';

describe('ACHIEVEMENTS', () => {
  it('defines every code exactly once', () => {
    expect(ACHIEVEMENTS.map((a) => a.code).sort()).toEqual(Object.values(AchievementCode).sort());
  });

  it('derives i18n keys from the code', () => {
    expect(ACHIEVEMENTS[0]).toMatchObject({
      code: 'first_bite',
      nameKey: 'achievements.first_bite.name',
      descriptionKey: 'achievements.first_bite.description',
    });
  });

  it('groups by trigger', () => {
    expect(achievementsFor('clan_joined').map((a) => a.code)).toEqual(['clansman']);
    expect(achievementsFor('totw_won').map((a) => a.code)).toEqual(['golden_toast']);
    expect(achievementsFor('toast_logged')).toHaveLength(8);
  });

  it('keeps local-hour windows inside one day', () => {
    for (const { condition } of ACHIEVEMENTS) {
      if (condition.kind !== 'local_hour') continue;
      expect(condition.fromHour).toBeGreaterThanOrEqual(0);
      expect(condition.toHour).toBeLessThanOrEqual(24);
      expect(condition.fromHour).toBeLessThan(condition.toHour);
    }
  });
});
