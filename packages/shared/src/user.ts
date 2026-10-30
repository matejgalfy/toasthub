import { z } from 'zod';

export const Locale = { sk: 'sk', en: 'en' } as const;
export const localeSchema = z.enum(Locale);
export type Locale = z.infer<typeof localeSchema>;

export const ProfileVisibility = { public: 'public', clan: 'clan' } as const;
export const profileVisibilitySchema = z.enum(ProfileVisibility);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

// App-wide role. Clan roles are separate and scoped to one clan.
export const UserRole = { user: 'user', admin: 'admin' } as const;
export const userRoleSchema = z.enum(UserRole);
export type UserRole = z.infer<typeof userRoleSchema>;

export const UserStatus = { active: 'active', banned: 'banned' } as const;
export const userStatusSchema = z.enum(UserStatus);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;
export const AVATAR_COUNT = 8;

// Leading and trailing spaces are trimmed, as the magic-link form does before sending.
export const emailSchema = z.string().trim().pipe(z.email());
export const displayNameSchema = z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX);
export const avatarIdSchema = z.int().min(1).max(AVATAR_COUNT);

/** The signed-in user's own profile. Only `/me` returns the email. */
export const meSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  // Null until onboarding sets it.
  displayName: z.string().nullable(),
  avatarId: avatarIdSchema.nullable(),
  locale: localeSchema,
  profileVisibility: profileVisibilitySchema,
  role: userRoleSchema,
  onboarded: z.boolean(),
  // The clan the user is in right now; null when in none (the Clan tab links here).
  clanId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof meSchema>;

export const meResponseSchema = z.object({ user: meSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

// Strict, so a stray field such as `role` is a 400 instead of being silently dropped.
export const updateMeSchema = z.strictObject({
  displayName: displayNameSchema.optional(),
  avatarId: avatarIdSchema.nullable().optional(),
  locale: localeSchema.optional(),
  profileVisibility: profileVisibilitySchema.optional(),
});
export type UpdateMe = z.infer<typeof updateMeSchema>;
