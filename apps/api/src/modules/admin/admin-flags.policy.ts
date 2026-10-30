import { FlagAction, FlagStatus, type LocalDate, type ResolveFlag } from '@toasthub/shared';

import { AppError } from '../../common/errors/app-error';

/** What resolving needs to know about a flag. */
export interface FlagFacts {
  status: FlagStatus;
  subjectUserId: string;
  // Photo reports point at a toast, count flags at a day.
  toastId: string | null;
  localDate: LocalDate | null;
}

/** Which toasts `reject_toasts` rejects: the reported one, or the subject's toasts of the flagged day. */
export type RejectScope =
  { kind: 'toast'; toastId: string } | { kind: 'day'; userId: string; localDate: LocalDate };

export interface Resolution {
  status: typeof FlagStatus.dismissed | typeof FlagStatus.actioned;
  reject: RejectScope | null;
  // The toast whose photo is hidden.
  hidePhotoOf: string | null;
  ban: boolean;
}

/**
 * Turns an admin's action on a flag into the changes to make (SPEC §4.4 BR-MOD-4). Checks run 409 (not
 * open any more) → 400 (the action doesn't fit the flag) → 409 (banning oneself). A flag ends `actioned`
 * once anything changed, also a dismiss with a ban; a plain dismiss ends `dismissed`.
 */
export function planResolution(
  flag: FlagFacts,
  { action, ban }: ResolveFlag,
  adminId: string,
): Resolution {
  if (flag.status !== FlagStatus.open) {
    throw new AppError('CONFLICT', 'This flag is already resolved');
  }
  if (action === FlagAction.hide_photo && flag.toastId === null) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
      action: 'This flag has no photo to hide',
    });
  }
  if (ban && flag.subjectUserId === adminId) {
    throw new AppError('CONFLICT', 'You cannot ban yourself');
  }

  let reject: RejectScope | null = null;
  if (action === FlagAction.reject_toasts) {
    if (flag.toastId !== null) reject = { kind: 'toast', toastId: flag.toastId };
    else if (flag.localDate !== null) {
      reject = { kind: 'day', userId: flag.subjectUserId, localDate: flag.localDate };
    } else {
      throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
        action: 'This flag has no toasts to reject',
      });
    }
  }
  const hidePhotoOf = action === FlagAction.hide_photo ? flag.toastId : null;
  return {
    status: action === FlagAction.dismiss && !ban ? FlagStatus.dismissed : FlagStatus.actioned,
    reject,
    hidePhotoOf,
    ban,
  };
}
