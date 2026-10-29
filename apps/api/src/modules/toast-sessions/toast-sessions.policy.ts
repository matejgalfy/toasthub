import { type LocalDate, TOAST_SESSION_MAX_COUNT } from '@toasthub/shared';

import { AppError } from '../../common/errors/app-error';

// The edit rules of SPEC §4.3 BR-TOAST-7, without the database.

/** What the rules need to know about a session. */
export interface SessionFacts {
  userId: string;
  localDate: LocalDate;
  hasRejectedToast: boolean;
}

/** Whether the session can still change: only on its own day, and not once an admin rejected a toast. */
export function isEditable(session: SessionFacts, today: LocalDate): boolean {
  return session.localDate === today && !session.hasRejectedToast;
}

/** 403 for someone else's session, 409 when it is past its day or has a rejected toast. */
export function assertCanEdit(session: SessionFacts, userId: string, today: LocalDate): void {
  if (session.userId !== userId) throw new AppError('FORBIDDEN', 'Not your toast session');
  if (session.localDate !== today) {
    throw new AppError('CONFLICT', 'A toast session can only be changed on its own day');
  }
  if (session.hasRejectedToast) {
    throw new AppError('CONFLICT', 'A toast session with a rejected toast cannot be changed');
  }
}

/** A photo an admin hid can be removed, but the session gets no other photo in its place. */
export function assertCanSetPhoto(photoHidden: boolean): void {
  if (photoHidden) throw new AppError('CONFLICT', 'The photo of this toast session was hidden');
}

export interface CountChange<T> {
  /** Toasts to add at the current time. */
  add: number;
  /** Toasts to soft-delete: the newest, never the lead toast. */
  remove: T[];
}

/**
 * How to go from the session's toasts (not deleted, oldest first, so the lead toast comes first) to
 * `count` toasts.
 */
export function planCountChange<T>(toasts: readonly T[], count: number): CountChange<T> {
  if (!Number.isInteger(count) || count < 1 || count > TOAST_SESSION_MAX_COUNT) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
      count: `Must be between 1 and ${String(TOAST_SESSION_MAX_COUNT)}`,
    });
  }
  if (count >= toasts.length) return { add: count - toasts.length, remove: [] };
  // `count` is at least 1, so index 0 (the lead toast) always stays.
  return { add: 0, remove: toasts.slice(count) };
}
