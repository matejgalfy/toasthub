import { z } from 'zod';

/** Admin-editable settings (SPEC §4.13). Stored as one `app_setting` row per key. */
export const appSettingsSchema = z.object({
  // More toasts than this on one local day opens a `count_threshold` flag.
  flagDailyThreshold: z.int().min(1).max(1000),
  // Includes the owner, so a clan needs room for at least one more member.
  clanMaxMembers: z.int().min(2).max(1000),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppSettingKey = keyof AppSettings;

export const APP_SETTING_DEFAULTS: AppSettings = {
  flagDailyThreshold: 8,
  clanMaxMembers: 10,
};
