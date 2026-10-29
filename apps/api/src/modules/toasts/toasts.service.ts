import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { type CreateToastResponse, FlagType, type LocalDate, type Toast } from '@toasthub/shared';
import { and, count, eq, isNull, sql } from 'drizzle-orm';

import { AppError } from '../../common/errors/app-error';
import { RateLimiter } from '../../common/rate-limiter';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { clanMembership, flag, like, toast } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from './countable-toasts';
import { PHOTO_CONTENT_TYPE, processPhoto } from './photo-pipeline';

type ToastRow = typeof toast.$inferSelect;

/** Toast creations per user and hour (SPEC §8). */
export const TOAST_RATE_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class ToastsService {
  private readonly logger = new Logger(ToastsService.name);
  private readonly createLimiter = new RateLimiter(TOAST_RATE_LIMIT, HOUR_MS);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /** Counts one creation attempt against the hourly limit. Called before the upload is read. */
  consumeCreateQuota(userId: string): void {
    if (!this.createLimiter.tryHit(userId)) {
      throw new AppError('RATE_LIMITED', 'Too many toasts, try again later');
    }
  }

  /** Logs a toast now, with an optional photo. The server sets the time (SPEC §4.3 BR-TOAST-1). */
  async create(userId: string, photo: Buffer | null): Promise<CreateToastResponse> {
    const photoKey = photo ? await this.storePhoto(userId, photo) : null;
    let created: ToastRow;
    try {
      created = await this.db.transaction(async (tx) => {
        const [membership] = await tx
          .select({ clanId: clanMembership.clanId })
          .from(clanMembership)
          .where(eq(clanMembership.userId, userId));
        const [row] = await tx
          .insert(toast)
          .values({ userId, clanId: membership?.clanId ?? null, photoKey })
          .returning();
        if (!row) throw new Error('Toast insert returned no row');
        await this.flagIfOverThreshold(tx, userId, row.localDate);
        return row;
      });
    } catch (error) {
      if (photoKey) await this.deletePhotoQuietly(photoKey);
      throw error;
    }
    // Achievements are evaluated from M7 on.
    return { toast: await this.toDto(created), newAchievements: [] };
  }

  /**
   * Soft-deletes one of the caller's toasts and removes its likes. The photo stays in storage for the
   * moderation trail and TOTW history (SPEC §12 D7).
   */
  async delete(userId: string, toastId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ userId: toast.userId })
        .from(toast)
        .where(and(eq(toast.id, toastId), isNull(toast.deletedAt)))
        .for('update');
      if (!row) throw new AppError('NOT_FOUND', 'Toast not found');
      if (row.userId !== userId) throw new AppError('FORBIDDEN', 'Not your toast');
      await tx
        .update(toast)
        .set({ deletedAt: sql`now()` })
        .where(eq(toast.id, toastId));
      await tx.delete(like).where(eq(like.toastId, toastId));
    });
  }

  /**
   * Opens a `count_threshold` flag once the user's countable toasts on `localDate` exceed the setting
   * (SPEC §4.4 BR-MOD-1). The unique index keeps it to one flag per user and day, even after a resolve.
   */
  private async flagIfOverThreshold(
    tx: DbExecutor,
    userId: string,
    localDate: LocalDate,
  ): Promise<void> {
    const threshold = await this.settings.get('flagDailyThreshold', tx);
    const [day] = await tx
      .select({ count: count() })
      .from(toast)
      .where(and(eq(toast.userId, userId), eq(toast.localDate, localDate), countableToasts()));
    if ((day?.count ?? 0) <= threshold) return;
    await tx
      .insert(flag)
      .values({ type: FlagType.count_threshold, subjectUserId: userId, localDate })
      .onConflictDoNothing();
  }

  private async storePhoto(userId: string, upload: Buffer): Promise<string> {
    const webp = await processPhoto(upload);
    const key = `toasts/${userId}/${randomUUID()}.webp`;
    await this.storage.put(key, webp, PHOTO_CONTENT_TYPE);
    return key;
  }

  private async deletePhotoQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      // An orphaned object only costs storage; the caller needs the original error.
      this.logger.warn({ err: error, key }, 'Could not delete the photo of a failed toast');
    }
  }

  private async toDto(row: ToastRow): Promise<Toast> {
    const photoKey = row.photoHiddenAt ? null : row.photoKey;
    return {
      id: row.id,
      userId: row.userId,
      clanId: row.clanId,
      eatenAt: row.eatenAt.toISOString(),
      localDate: row.localDate,
      photoUrl: photoKey ? await this.storage.presignGet(photoKey) : null,
    };
  }
}
