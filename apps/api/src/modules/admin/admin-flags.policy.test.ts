import { describe, expect, it } from 'vitest';

import { type FlagFacts, planResolution } from './admin-flags.policy';

const ADMIN = 'admin';

const countFlag: FlagFacts = {
  status: 'open',
  subjectUserId: 'ann',
  toastId: null,
  localDate: '2026-10-28',
};
const photoFlag: FlagFacts = {
  status: 'open',
  subjectUserId: 'ann',
  toastId: 'toast-1',
  localDate: null,
};

function errorOf(run: () => unknown): { code: string; fields?: Record<string, string> } {
  try {
    run();
  } catch (error) {
    return error as { code: string; fields?: Record<string, string> };
  }
  throw new Error('Expected an error');
}

describe('planResolution', () => {
  it('dismisses without changing anything', () => {
    expect(planResolution(countFlag, { action: 'dismiss', ban: false }, ADMIN)).toEqual({
      status: 'dismissed',
      reject: null,
      hidePhotoOf: null,
      ban: false,
    });
  });

  it('marks a dismiss with a ban as actioned', () => {
    expect(planResolution(photoFlag, { action: 'dismiss', ban: true }, ADMIN)).toMatchObject({
      status: 'actioned',
      ban: true,
    });
  });

  it("rejects the day's toasts of a count flag", () => {
    expect(planResolution(countFlag, { action: 'reject_toasts', ban: false }, ADMIN)).toEqual({
      status: 'actioned',
      reject: { kind: 'day', userId: 'ann', localDate: '2026-10-28' },
      hidePhotoOf: null,
      ban: false,
    });
  });

  it('rejects only the reported toast of a photo report', () => {
    expect(planResolution(photoFlag, { action: 'reject_toasts', ban: false }, ADMIN)).toMatchObject(
      { status: 'actioned', reject: { kind: 'toast', toastId: 'toast-1' }, hidePhotoOf: null },
    );
  });

  it('hides the photo of a photo report', () => {
    expect(planResolution(photoFlag, { action: 'hide_photo', ban: true }, ADMIN)).toEqual({
      status: 'actioned',
      reject: null,
      hidePhotoOf: 'toast-1',
      ban: true,
    });
  });

  it('refuses to hide a photo on a count flag', () => {
    const error = errorOf(() =>
      planResolution(countFlag, { action: 'hide_photo', ban: false }, ADMIN),
    );
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields).toHaveProperty('action');
  });

  it('refuses a flag that is no longer open', () => {
    for (const status of ['dismissed', 'actioned'] as const) {
      const error = errorOf(() =>
        planResolution({ ...countFlag, status }, { action: 'dismiss', ban: false }, ADMIN),
      );
      expect(error.code).toBe('CONFLICT');
    }
  });

  it('refuses to let an admin ban themselves', () => {
    const own = { ...countFlag, subjectUserId: ADMIN };
    expect(errorOf(() => planResolution(own, { action: 'dismiss', ban: true }, ADMIN)).code).toBe(
      'CONFLICT',
    );
    expect(planResolution(own, { action: 'reject_toasts', ban: false }, ADMIN).status).toBe(
      'actioned',
    );
  });
});
