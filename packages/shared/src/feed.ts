import { z } from 'zod';

import { pageSchema } from './pagination.js';
import { userSummarySchema } from './profile.js';
import { localDateSchema } from './time.js';

/**
 * One toast session in a feed: the global feed on home (`/feed`) or a clan's feed (`/clans/:id/feed`),
 * SPEC §4.8 and §4.14. Both show the same likes, since they are stored on the session's lead toast.
 */
export const feedItemSchema = z.object({
  sessionId: z.uuid(),
  // The session's lead toast, which likes and reports refer to.
  toastId: z.uuid(),
  user: userSummarySchema,
  loggedAt: z.iso.datetime(),
  localDate: localDateSchema,
  // Countable toasts in the session.
  count: z.int().positive(),
  // Presigned and valid for 1 hour; null without a photo or when an admin hid it.
  photoUrl: z.url().nullable(),
  // 🍞 likes on the session, stored on its lead toast (SPEC §4.9).
  likeCount: z.int().nonnegative(),
  likedByMe: z.boolean(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

/** Newest first. */
export const feedPageSchema = pageSchema(feedItemSchema);
export type FeedPage = z.infer<typeof feedPageSchema>;
