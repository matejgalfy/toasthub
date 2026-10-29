import { z } from 'zod';

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
