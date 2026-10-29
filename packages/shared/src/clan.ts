import { z } from 'zod';

import { achievementCodeSchema } from './achievements.js';
import { pageQuerySchema, pageSchema } from './pagination.js';
import { userSummarySchema } from './profile.js';
import { streakSchema } from './streak.js';
import { localDateSchema } from './time.js';

export const CLAN_NAME_MAX = 40;
export const CLAN_DESCRIPTION_MAX = 280;

export const ClanRole = { owner: 'owner', officer: 'officer', member: 'member' } as const;
export const clanRoleSchema = z.enum(ClanRole);
export type ClanRole = z.infer<typeof clanRoleSchema>;

export const JoinRequestStatus = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
} as const;
export const joinRequestStatusSchema = z.enum(JoinRequestStatus);
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;

export const CLAN_NAME_MIN = 3;
export const CLAN_SEARCH_MAX = CLAN_NAME_MAX;

// Unique case-insensitively among clans that are not deleted (BR-CLAN-2).
export const clanNameSchema = z.string().trim().min(CLAN_NAME_MIN).max(CLAN_NAME_MAX);
// An empty description is stored as none.
export const clanDescriptionSchema = z.string().trim().max(CLAN_DESCRIPTION_MAX);

// Strict, so a stray field such as `ownerId` is a 400 instead of being silently dropped.
export const createClanSchema = z.strictObject({
  name: clanNameSchema,
  description: clanDescriptionSchema.nullable().optional(),
});
export type CreateClan = z.infer<typeof createClanSchema>;

export const updateClanSchema = z.strictObject({
  name: clanNameSchema.optional(),
  description: clanDescriptionSchema.nullable().optional(),
});
export type UpdateClan = z.infer<typeof updateClanSchema>;

export const clanParamsSchema = z.object({ id: z.uuid() });
export type ClanParams = z.infer<typeof clanParamsSchema>;

export const clanRequestParamsSchema = z.object({ id: z.uuid(), rid: z.uuid() });
export type ClanRequestParams = z.infer<typeof clanRequestParamsSchema>;

export const clanListQuerySchema = pageQuerySchema.extend({
  // Part of the name, case-insensitive; blank lists every clan.
  search: z.preprocess(
    (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(CLAN_SEARCH_MAX).optional(),
  ),
});
export type ClanListQuery = z.infer<typeof clanListQuerySchema>;

export const clanSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type Clan = z.infer<typeof clanSchema>;

export const clanResponseSchema = z.object({ clan: clanSchema });
export type ClanResponse = z.infer<typeof clanResponseSchema>;

export const createClanResponseSchema = z.object({
  clan: clanSchema,
  // The creator joined a clan, which can earn `clansman`.
  newAchievements: z.array(achievementCodeSchema),
});
export type CreateClanResponse = z.infer<typeof createClanResponseSchema>;

/** Clans by name, A–Z. */
export const clanPageSchema = pageSchema(clanSchema);
export type ClanPage = z.infer<typeof clanPageSchema>;

export const clanMemberSchema = z.object({
  user: userSummarySchema,
  role: clanRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type ClanMember = z.infer<typeof clanMemberSchema>;

export const clanJoinRequestSchema = z.object({
  id: z.uuid(),
  clanId: z.uuid(),
  user: userSummarySchema,
  status: joinRequestStatusSchema,
  createdAt: z.iso.datetime(),
});
export type ClanJoinRequest = z.infer<typeof clanJoinRequestSchema>;

export const clanDetailSchema = z.object({
  clan: clanSchema,
  // Over the toasts credited to the clan when they were logged (SPEC §12 D9).
  streak: streakSchema,
  // Owner first, then officers, then members; each group by join time.
  members: z.array(clanMemberSchema),
  // The caller's role here; null when not a member.
  myRole: clanRoleSchema.nullable(),
  // The caller's pending request to join this clan, if any.
  myRequest: clanJoinRequestSchema.nullable(),
});
export type ClanDetail = z.infer<typeof clanDetailSchema>;

export const clanJoinRequestResponseSchema = z.object({ request: clanJoinRequestSchema });
export type ClanJoinRequestResponse = z.infer<typeof clanJoinRequestResponseSchema>;

/** Pending requests to join a clan, oldest first. */
export const clanJoinRequestListSchema = z.object({ items: z.array(clanJoinRequestSchema) });
export type ClanJoinRequestList = z.infer<typeof clanJoinRequestListSchema>;

export const clanMembershipSchema = clanMemberSchema.extend({ clanId: z.uuid() });
export type ClanMembership = z.infer<typeof clanMembershipSchema>;

export const clanMembershipResponseSchema = z.object({ membership: clanMembershipSchema });
export type ClanMembershipResponse = z.infer<typeof clanMembershipResponseSchema>;

export const clanMemberParamsSchema = z.object({ id: z.uuid(), userId: z.uuid() });
export type ClanMemberParams = z.infer<typeof clanMemberParamsSchema>;

// Ownership only changes hands through a transfer.
export const updateClanMemberSchema = z.strictObject({
  role: z.enum([ClanRole.officer, ClanRole.member]),
});
export type UpdateClanMember = z.infer<typeof updateClanMemberSchema>;

export const transferClanSchema = z.strictObject({ userId: z.uuid() });
export type TransferClan = z.infer<typeof transferClanSchema>;

export const clanTransferResponseSchema = z.object({
  owner: clanMembershipSchema,
  // The former Owner stays in the clan as an Officer.
  previousOwner: clanMembershipSchema,
});
export type ClanTransferResponse = z.infer<typeof clanTransferResponseSchema>;

/** One toast session of a current member in the clan feed (SPEC §4.8). */
export const clanFeedItemSchema = z.object({
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
export type ClanFeedItem = z.infer<typeof clanFeedItemSchema>;

/** Newest first. */
export const clanFeedPageSchema = pageSchema(clanFeedItemSchema);
export type ClanFeedPage = z.infer<typeof clanFeedPageSchema>;
