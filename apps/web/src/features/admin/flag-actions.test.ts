import { describe, expect, it } from 'vitest';

import type { AdminFlag } from '@toasthub/shared';

import { canBanSubject, flagActionChoices } from './flag-actions';

const SUBJECT_ID = '01900000-0000-7000-8000-0000000000a1';
const ADMIN_ID = '01900000-0000-7000-8000-0000000000ad';

const countFlag: AdminFlag = {
  id: '01900000-0000-7000-8000-000000000f01',
  type: 'count_threshold',
  status: 'open',
  createdAt: '2026-10-29T10:00:00.000Z',
  subject: { id: SUBJECT_ID, displayName: 'Ann', avatarId: 1, status: 'active' },
  reporter: null,
  reason: null,
  localDate: '2026-10-29',
  day: { active: 9, rejected: 0 },
  toast: null,
  resolvedBy: null,
  resolvedAt: null,
};

const photoFlag: AdminFlag = {
  ...countFlag,
  type: 'photo_report',
  localDate: null,
  day: null,
  toast: {
    id: '01900000-0000-7000-8000-000000000101',
    sessionId: '01900000-0000-7000-8000-000000000101',
    eatenAt: '2026-10-29T07:00:00.000Z',
    localDate: '2026-10-29',
    status: 'active',
    deleted: false,
    photoUrl: 'https://photos.test/a.webp',
    photoHidden: false,
    earlierPhotoUrls: [],
  },
};

describe('flagActionChoices', () => {
  it("offers dismiss and rejecting the day's toasts on a count flag", () => {
    expect(flagActionChoices(countFlag).map((choice) => choice.label)).toEqual([
      'dismiss',
      'rejectDay',
    ]);
  });

  it('adds hiding the photo on a photo report', () => {
    expect(flagActionChoices(photoFlag)).toEqual([
      { action: 'dismiss', label: 'dismiss' },
      { action: 'reject_toasts', label: 'rejectToast' },
      { action: 'hide_photo', label: 'hidePhoto' },
    ]);
  });

  it('offers nothing once the flag is resolved', () => {
    expect(flagActionChoices({ ...photoFlag, status: 'actioned' })).toEqual([]);
    expect(flagActionChoices({ ...countFlag, status: 'dismissed' })).toEqual([]);
  });
});

describe('canBanSubject', () => {
  it('allows banning an active subject other than the admin', () => {
    expect(canBanSubject(countFlag, ADMIN_ID)).toBe(true);
  });

  it('never offers banning oneself or someone already banned', () => {
    expect(canBanSubject(countFlag, SUBJECT_ID)).toBe(false);
    expect(
      canBanSubject(
        { ...countFlag, subject: { ...countFlag.subject, status: 'banned' } },
        ADMIN_ID,
      ),
    ).toBe(false);
  });
});
