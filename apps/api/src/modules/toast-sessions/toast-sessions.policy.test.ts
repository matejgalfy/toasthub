import { describe, expect, it } from 'vitest';

import { AppError } from '../../common/errors/app-error';
import {
  assertCanEdit,
  assertCanSetPhoto,
  isEditable,
  planCountChange,
  type SessionFacts,
} from './toast-sessions.policy';

const TODAY = '2026-10-29';
const session: SessionFacts = { userId: 'ann', localDate: TODAY, hasRejectedToast: false };

/** The `AppError` code `fn(...args)` throws, or undefined when it returns. */
function errorCode<A extends unknown[]>(fn: (...args: A) => unknown, ...args: A) {
  try {
    fn(...args);
    return undefined;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('isEditable', () => {
  it("is true for today's session", () => {
    expect(isEditable(session, TODAY)).toBe(true);
  });

  it('is false from the next day on', () => {
    expect(isEditable(session, '2026-10-30')).toBe(false);
    expect(isEditable({ ...session, localDate: '2025-10-29' }, TODAY)).toBe(false);
  });

  it('is false once an admin rejected a toast in it', () => {
    expect(isEditable({ ...session, hasRejectedToast: true }, TODAY)).toBe(false);
  });
});

describe('assertCanEdit', () => {
  it('lets the owner change it on its day', () => {
    expect(errorCode(assertCanEdit, session, 'ann', TODAY)).toBeUndefined();
  });

  it("refuses someone else's session, also on its day", () => {
    expect(errorCode(assertCanEdit, session, 'bob', TODAY)).toBe('FORBIDDEN');
  });

  it('is a conflict after its day', () => {
    expect(errorCode(assertCanEdit, session, 'ann', '2026-10-30')).toBe('CONFLICT');
  });

  it('is a conflict with a rejected toast', () => {
    const rejected = { ...session, hasRejectedToast: true };
    expect(errorCode(assertCanEdit, rejected, 'ann', TODAY)).toBe('CONFLICT');
  });

  it('checks the owner before the day', () => {
    expect(errorCode(assertCanEdit, session, 'bob', '2026-10-30')).toBe('FORBIDDEN');
  });
});

describe('assertCanSetPhoto', () => {
  it('allows a photo unless an admin hid the current one', () => {
    expect(errorCode(assertCanSetPhoto, false)).toBeUndefined();
    expect(errorCode(assertCanSetPhoto, true)).toBe('CONFLICT');
  });
});

describe('planCountChange', () => {
  const toasts = ['lead', 'second', 'third'];

  it('adds the missing toasts when raising', () => {
    expect(planCountChange(toasts, 5)).toEqual({ add: 2, remove: [] });
  });

  it('changes nothing for the same count', () => {
    expect(planCountChange(toasts, 3)).toEqual({ add: 0, remove: [] });
  });

  it('removes the newest toasts when lowering', () => {
    expect(planCountChange(toasts, 2)).toEqual({ add: 0, remove: ['third'] });
  });

  it('keeps the lead toast when lowering to one', () => {
    expect(planCountChange(toasts, 1)).toEqual({ add: 0, remove: ['second', 'third'] });
  });

  it('raises up to 10', () => {
    expect(planCountChange(toasts, 10)).toEqual({ add: 7, remove: [] });
  });

  it.each([0, 11, 2.5, -1])('rejects a count of %d', (count) => {
    expect(errorCode(planCountChange, toasts, count)).toBe('VALIDATION_ERROR');
  });
});
