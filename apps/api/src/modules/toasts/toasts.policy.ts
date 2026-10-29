import { AppError } from '../../common/errors/app-error';
import { canSeeToast, type PhotoFacts, type Viewer } from '../users/users.policy';

// Who may like or report a toast (SPEC §4.4 BR-MOD-3, §4.9), without the database.

export interface ReactionFacts extends PhotoFacts {
  // The session's lead toast, which carries its photo, likes and reports (SPEC §12 D43).
  isLead: boolean;
}

/**
 * 404 for a removed toast or one that isn't a session's lead toast, 403 when the viewer can't see it. A
 * session without a photo can be liked too.
 */
export function assertCanLike(viewer: Viewer, toast: ReactionFacts): void {
  if (toast.removed || !toast.isLead) throw new AppError('NOT_FOUND', 'Toast not found');
  if (!canSeeToast(viewer, toast)) {
    throw new AppError('FORBIDDEN', 'You cannot see this toast');
  }
}

/** 404 for a removed toast, 403 when the viewer can't see it, 409 without a visible photo to report. */
export function assertCanReport(viewer: Viewer, toast: ReactionFacts): void {
  if (toast.removed) throw new AppError('NOT_FOUND', 'Toast not found');
  if (!canSeeToast(viewer, toast)) {
    throw new AppError('FORBIDDEN', 'You cannot see this toast');
  }
  if (!toast.hasPhoto || toast.hidden) {
    throw new AppError('CONFLICT', 'This toast has no photo to report');
  }
}
