import { AppError } from '../../common/errors/app-error';
import { canSeeToast, type PhotoFacts } from '../users/users.policy';

// Who may like or report a toast (SPEC §4.4 BR-MOD-3, §4.9), without the database.

export interface ReactionFacts extends PhotoFacts {
  // The session's lead toast, which carries its photo, likes and reports (SPEC §12 D43).
  isLead: boolean;
}

/** 404 for a removed toast or one that isn't a session's lead toast. A session without a photo can be liked too. */
export function assertCanLike(toast: ReactionFacts): void {
  if (!canSeeToast(toast) || !toast.isLead) throw new AppError('NOT_FOUND', 'Toast not found');
}

/** 404 for a removed toast, 409 without a visible photo to report. */
export function assertCanReport(toast: ReactionFacts): void {
  if (!canSeeToast(toast)) throw new AppError('NOT_FOUND', 'Toast not found');
  if (!toast.hasPhoto || toast.hidden) {
    throw new AppError('CONFLICT', 'This toast has no photo to report');
  }
}
