import { describe, expect, it } from 'vitest';

import type { HomeResponse } from '@toasthub/shared';

import { withLoggedToasts } from './home-query';

const home: HomeResponse = {
  todayCount: 0,
  streak: { current: 0, longest: 0 },
  clanStreak: { current: 2, longest: 4 },
  fact: null,
  toastOfTheWeek: null,
};

describe('withLoggedToasts', () => {
  it('starts a streak with the first toast ever', () => {
    expect(withLoggedToasts(home, 1)).toEqual({
      ...home,
      todayCount: 1,
      streak: { current: 1, longest: 1 },
    });
  });

  it('extends a streak that ran until yesterday, raising the longest when passed', () => {
    expect(withLoggedToasts({ ...home, streak: { current: 3, longest: 3 } }, 1).streak).toEqual({
      current: 4,
      longest: 4,
    });
    expect(withLoggedToasts({ ...home, streak: { current: 3, longest: 9 } }, 1).streak).toEqual({
      current: 4,
      longest: 9,
    });
  });

  it('extends the streak by one day however many toasts are logged at once', () => {
    expect(withLoggedToasts({ ...home, streak: { current: 3, longest: 3 } }, 4)).toEqual({
      ...home,
      todayCount: 4,
      streak: { current: 4, longest: 4 },
    });
  });

  it('only counts later toasts of the same day', () => {
    const today = { ...home, todayCount: 2, streak: { current: 5, longest: 5 } };
    expect(withLoggedToasts(today, 3)).toEqual({ ...today, todayCount: 5 });
  });

  it('changes nothing for zero toasts', () => {
    expect(withLoggedToasts(home, 0)).toBe(home);
  });

  it('leaves the clan streak to the server', () => {
    expect(withLoggedToasts(home, 1).clanStreak).toEqual(home.clanStreak);
  });
});
