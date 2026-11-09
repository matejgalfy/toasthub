// The visibility rules of SPEC §4.2, §4.8 and §4.10, without the database. Every profile is public (§12 D67),
// so only moderation hides anything: a removed toast or a photo an admin hid.

export interface ToastFacts {
  // The toast doesn't count any more: deleted, rejected, or its owner is banned.
  removed: boolean;
}

export interface PhotoFacts extends ToastFacts {
  hasPhoto: boolean;
  // An admin hid it (BR-MOD-4).
  hidden: boolean;
}

/**
 * Whether a signed-in user may see the toast itself (its session, count and likes), with or without its
 * photo. A removed toast is seen by nobody here, not even its owner.
 */
export function canSeeToast(toast: ToastFacts): boolean {
  return !toast.removed;
}

/**
 * Whether a signed-in user may get a presigned URL for the photo. A hidden or removed photo is shown to
 * nobody here, not even its owner (admins see it through the moderation routes).
 */
export function canSeePhoto(photo: PhotoFacts): boolean {
  return photo.hasPhoto && !photo.hidden && canSeeToast(photo);
}
