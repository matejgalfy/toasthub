import { ProfileAccess, ProfileVisibility } from '@toasthub/shared';

// The visibility rules of SPEC §4.2, §4.8 and §4.10, without the database.

/** The signed-in user looking at a profile or a photo. */
export interface Viewer {
  userId: string;
  // The viewer's current clan.
  clanId: string | null;
}

/** The user whose profile or photo is looked at. */
export interface ProfileOwner {
  userId: string;
  profileVisibility: ProfileVisibility;
  // The owner's current clan, not the one a toast was logged in.
  clanId: string | null;
}

export interface PhotoFacts {
  owner: ProfileOwner;
  hasPhoto: boolean;
  // An admin hid it (BR-MOD-4).
  hidden: boolean;
  // The toast doesn't count any more: deleted, rejected, or its owner is banned.
  removed: boolean;
  // The toast won a Toast of the week draw, which shows its photo to everyone (BR-TOTW-2).
  wonToastOfTheWeek: boolean;
}

export function isClanmate(viewer: Viewer, owner: ProfileOwner): boolean {
  return viewer.clanId !== null && viewer.clanId === owner.clanId;
}

/** The own profile and public ones are full; a `clan` profile is full only for clanmates. */
export function profileAccess(viewer: Viewer, owner: ProfileOwner): ProfileAccess {
  if (viewer.userId === owner.userId) return ProfileAccess.full;
  if (owner.profileVisibility === ProfileVisibility.public) return ProfileAccess.full;
  return isClanmate(viewer, owner) ? ProfileAccess.full : ProfileAccess.reduced;
}

/**
 * Whether the viewer may get a presigned URL for the photo. A hidden or removed photo is shown to nobody
 * here, not even its owner (admins see it through the moderation routes). Clanmates always see each
 * other's photos (§4.8), and a Toast of the week winner is visible to all.
 */
export function canSeePhoto(viewer: Viewer, photo: PhotoFacts): boolean {
  if (!photo.hasPhoto || photo.hidden || photo.removed) return false;
  if (photo.wonToastOfTheWeek) return true;
  return profileAccess(viewer, photo.owner) === ProfileAccess.full;
}
