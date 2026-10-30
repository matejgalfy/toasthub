/** The pg-boss queues. Each has one handler in `JobsService` and a cron schedule. */
export const JobName = {
  totwDraw: 'totw-draw',
  cleanupVerifications: 'cleanup-verifications',
  cleanupPhotos: 'cleanup-photos',
} as const;
export type JobName = (typeof JobName)[keyof typeof JobName];

/** Cron expressions, evaluated in Europe/Bratislava (SPEC §12 D2). */
export const JOB_SCHEDULES: Record<JobName, string> = {
  // Monday 00:00: the week before has just ended (BR-TOTW-1).
  [JobName.totwDraw]: '0 0 * * 1',
  // Nightly, when nobody toasts.
  [JobName.cleanupVerifications]: '15 3 * * *',
  [JobName.cleanupPhotos]: '30 3 * * *',
};

export function isJobName(value: string): value is JobName {
  return (Object.values(JobName) as string[]).includes(value);
}
