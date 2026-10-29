import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AchievementCode,
  AchievementTrigger,
  FlagType,
  type LocalDate,
  localDate,
  type PageQuery,
  type ToastSession,
  type ToastSessionChangeResponse,
  type ToastSessionPage,
  type ToastSessionResponse,
  ToastStatus,
} from '@toasthub/shared';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { decodeCursor, toPage } from '../../common/pagination';
import { RateLimiter } from '../../common/rate-limiter';
import { type Database, DB, type DbExecutor } from '../../db/db.module';
import { clanMembership, discardedPhoto, flag, like, toast, toastSession } from '../../db/schema';
import { AchievementsService } from '../achievements/achievements.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from '../toasts/countable-toasts';
import { PHOTO_CONTENT_TYPE, processPhoto } from '../toasts/photo-pipeline';
import {
  assertCanEdit,
  assertCanSetPhoto,
  isEditable,
  planCountChange,
  type SessionFacts,
} from './toast-sessions.policy';

/** Toasts created per user and hour, and photo uploads with them (SPEC §8, §12 D44). */
export const TOAST_RATE_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

const sessionColumns = {
  id: toastSession.id,
  userId: toastSession.userId,
  localDate: toastSession.localDate,
  createdAt: toastSession.createdAt,
};
type SessionRow = Pick<typeof toastSession.$inferSelect, keyof typeof sessionColumns>;

const toastColumns = {
  id: toast.id,
  sessionId: toast.sessionId,
  status: toast.status,
  eatenAt: toast.eatenAt,
  photoKey: toast.photoKey,
  photoHiddenAt: toast.photoHiddenAt,
};
type ToastRow = Pick<typeof toast.$inferSelect, keyof typeof toastColumns>;

// `created_at` with all six fraction digits: a JS Date would round it to milliseconds and skip rows.
const cursorAt = sql<string>`to_char(${toastSession.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const keysetSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });

interface LoadedSession {
  session: SessionRow;
  // Not deleted, oldest first: the lead toast comes first.
  toasts: ToastRow[];
}

function factsOf({ session, toasts }: LoadedSession): SessionFacts {
  return {
    userId: session.userId,
    localDate: session.localDate,
    hasRejectedToast: toasts.some((row) => row.status === ToastStatus.rejected),
  };
}

function leadOf(toasts: ToastRow[]): ToastRow {
  const [lead] = toasts;
  // The lead toast is only deleted together with its session.
  if (!lead) throw new Error('Toast session without toasts');
  return lead;
}

@Injectable()
export class ToastSessionsService {
  private readonly logger = new Logger(ToastSessionsService.name);
  private readonly createLimiter = new RateLimiter(TOAST_RATE_LIMIT, HOUR_MS);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /** Counts `hits` (toasts, or one photo upload) against the hourly limit, all or none. */
  consumeQuota(userId: string, hits: number): void {
    if (!this.createLimiter.tryHit(userId, Date.now(), hits)) {
      throw new AppError('RATE_LIMITED', 'Too many toasts, try again later');
    }
  }

  /**
   * Logs `count` toasts now as one session, the optional photo on its lead toast. The server sets the
   * time (SPEC §4.3 BR-TOAST-1); all toasts are saved or none.
   */
  async create(
    userId: string,
    count: number,
    photo: Buffer | null,
  ): Promise<ToastSessionChangeResponse> {
    const photoKey = photo ? await this.storePhoto(userId, photo) : null;
    let session: SessionRow;
    try {
      session = await this.db.transaction(async (tx) => {
        const clanId = await this.currentClanId(tx, userId);
        const [row] = await tx.insert(toastSession).values({ userId }).returning(sessionColumns);
        if (!row) throw new Error('Toast session insert returned no row');
        // `now()` is fixed per transaction, so the toasts share the session's time; their v7 ids rise
        // in insert order, so the first row is the lead toast.
        await tx.insert(toast).values(
          Array.from({ length: count }, (_, i) => ({
            userId,
            sessionId: row.id,
            clanId,
            photoKey: i === 0 ? photoKey : null,
          })),
        );
        await this.flagIfOverThreshold(tx, userId, row.localDate);
        return row;
      });
    } catch (error) {
      if (photoKey) await this.deletePhotoQuietly(photoKey);
      throw error;
    }
    return this.respond(userId, session.id, session.createdAt);
  }

  /** The caller's sessions, newest first (BR-TOAST-6). */
  async list(userId: string, { cursor, limit }: PageQuery): Promise<ToastSessionPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.db
      .select({ ...sessionColumns, cursorAt })
      .from(toastSession)
      .where(
        and(
          eq(toastSession.userId, userId),
          isNull(toastSession.deletedAt),
          after
            ? sql`(${toastSession.createdAt}, ${toastSession.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(toastSession.createdAt), desc(toastSession.id))
      .limit(limit + 1);
    const page = toPage(rows, limit, (row) => ({ at: row.cursorAt, id: row.id }));
    return { items: await this.toDtos(page.items), nextCursor: page.nextCursor };
  }

  /**
   * Sets the number of toasts (BR-TOAST-7). Added toasts are eaten now and count like a new log; lowering
   * soft-deletes the newest toasts and their likes, never the lead toast.
   */
  async updateCount(
    userId: string,
    sessionId: string,
    count: number,
  ): Promise<ToastSessionChangeResponse> {
    // One instant for the day check and the added toasts, so they can't land on the next day.
    const now = new Date();
    const today = localDate(now);
    const added = await this.db.transaction(async (tx) => {
      const loaded = await this.loadSession(tx, sessionId);
      assertCanEdit(factsOf(loaded), userId, today);
      const plan = planCountChange(loaded.toasts, count);
      if (plan.remove.length > 0) {
        const ids = plan.remove.map((row) => row.id);
        await tx.update(toast).set({ deletedAt: now }).where(inArray(toast.id, ids));
        await tx.delete(like).where(inArray(like.toastId, ids));
      }
      if (plan.add > 0) {
        this.consumeQuota(userId, plan.add);
        const clanId = await this.currentClanId(tx, userId);
        await tx
          .insert(toast)
          .values(
            Array.from({ length: plan.add }, () => ({ userId, sessionId, clanId, eatenAt: now })),
          );
        await this.flagIfOverThreshold(tx, userId, today);
      }
      return plan.add;
    });
    return this.respond(userId, sessionId, added > 0 ? now : null);
  }

  /** 404, 403 or 409 before a photo upload is read, so a refused one costs no processing. */
  async assertCanSetPhoto(userId: string, sessionId: string): Promise<void> {
    const loaded = await this.loadSession(this.db, sessionId, { lock: false });
    assertCanEdit(factsOf(loaded), userId, localDate(new Date()));
    assertCanSetPhoto(leadOf(loaded.toasts).photoHiddenAt !== null);
  }

  /** Adds or replaces the photo on the lead toast. A replaced photo is kept for the cleanup job. */
  async setPhoto(
    userId: string,
    sessionId: string,
    upload: Buffer,
  ): Promise<ToastSessionChangeResponse> {
    const today = localDate(new Date());
    const photoKey = await this.storePhoto(userId, upload);
    let lead: ToastRow;
    try {
      lead = await this.db.transaction(async (tx) => {
        const loaded = await this.loadSession(tx, sessionId);
        assertCanEdit(factsOf(loaded), userId, today);
        const row = leadOf(loaded.toasts);
        assertCanSetPhoto(row.photoHiddenAt !== null);
        await this.discardPhoto(tx, row);
        await tx.update(toast).set({ photoKey }).where(eq(toast.id, row.id));
        return row;
      });
    } catch (error) {
      await this.deletePhotoQuietly(photoKey);
      throw error;
    }
    return this.respond(userId, sessionId, lead.eatenAt);
  }

  /** Removes the photo, also one an admin hid; the session then can't get a new one (SPEC §12 D44). */
  async removePhoto(userId: string, sessionId: string): Promise<ToastSessionResponse> {
    const today = localDate(new Date());
    await this.db.transaction(async (tx) => {
      const loaded = await this.loadSession(tx, sessionId);
      assertCanEdit(factsOf(loaded), userId, today);
      const lead = leadOf(loaded.toasts);
      if (lead.photoKey === null) return;
      await this.discardPhoto(tx, lead);
      await tx.update(toast).set({ photoKey: null }).where(eq(toast.id, lead.id));
    });
    return { session: await this.getDto(sessionId) };
  }

  /**
   * Soft-deletes the session with its toasts and removes their likes (BR-TOAST-3). The photo stays in
   * storage for the moderation trail and TOTW history (SPEC §12 D7).
   */
  async delete(userId: string, sessionId: string): Promise<void> {
    const today = localDate(new Date());
    await this.db.transaction(async (tx) => {
      const loaded = await this.loadSession(tx, sessionId);
      assertCanEdit(factsOf(loaded), userId, today);
      const ids = loaded.toasts.map((row) => row.id);
      await tx
        .update(toast)
        .set({ deletedAt: sql`now()` })
        .where(inArray(toast.id, ids));
      await tx
        .update(toastSession)
        .set({ deletedAt: sql`now()` })
        .where(eq(toastSession.id, sessionId));
      await tx.delete(like).where(inArray(like.toastId, ids));
    });
  }

  /**
   * A session that isn't deleted, with its toasts; 404 otherwise. Locked by default, so concurrent edits
   * of one session run one after the other.
   */
  private async loadSession(
    executor: DbExecutor,
    sessionId: string,
    { lock = true } = {},
  ): Promise<LoadedSession> {
    const query = executor
      .select(sessionColumns)
      .from(toastSession)
      .where(and(eq(toastSession.id, sessionId), isNull(toastSession.deletedAt)));
    const [session] = lock ? await query.for('update') : await query;
    if (!session) throw new AppError('NOT_FOUND', 'Toast session not found');
    const toasts = await executor
      .select(toastColumns)
      .from(toast)
      .where(and(eq(toast.sessionId, sessionId), isNull(toast.deletedAt)))
      .orderBy(asc(toast.eatenAt), asc(toast.id));
    return { session, toasts };
  }

  private async getDto(sessionId: string): Promise<ToastSession> {
    const rows = await this.db
      .select(sessionColumns)
      .from(toastSession)
      .where(eq(toastSession.id, sessionId));
    const [dto] = await this.toDtos(rows);
    if (!dto) throw new Error('Toast session vanished after a change');
    return dto;
  }

  private async toDtos(sessions: SessionRow[]): Promise<ToastSession[]> {
    if (sessions.length === 0) return [];
    const toasts = await this.db
      .select(toastColumns)
      .from(toast)
      .where(
        and(
          inArray(
            toast.sessionId,
            sessions.map((s) => s.id),
          ),
          isNull(toast.deletedAt),
        ),
      )
      .orderBy(asc(toast.eatenAt), asc(toast.id));
    const bySession = Map.groupBy(toasts, (row) => row.sessionId);
    const today = localDate(new Date());
    return Promise.all(
      sessions.map(async (session) => {
        const own = bySession.get(session.id) ?? [];
        const lead = own[0];
        const visibleKey = lead?.photoHiddenAt ? null : (lead?.photoKey ?? null);
        return {
          id: session.id,
          loggedAt: session.createdAt.toISOString(),
          localDate: session.localDate,
          count: own.length,
          hasPhoto: lead?.photoKey != null,
          photoUrl: visibleKey ? await this.storage.presignGet(visibleKey) : null,
          photoHidden: lead?.photoHiddenAt != null,
          editable: isEditable(factsOf({ session, toasts: own }), today),
        };
      }),
    );
  }

  /** The session after a change, with the achievements it earned when `eatenAt` is set. */
  private async respond(
    userId: string,
    sessionId: string,
    eatenAt: Date | null,
  ): Promise<ToastSessionChangeResponse> {
    const [session, newAchievements] = await Promise.all([
      this.getDto(sessionId),
      eatenAt ? this.evaluateAchievements(userId, sessionId, eatenAt) : [],
    ]);
    return { session, newAchievements };
  }

  private async currentClanId(tx: DbExecutor, userId: string): Promise<string | null> {
    const [membership] = await tx
      .select({ clanId: clanMembership.clanId })
      .from(clanMembership)
      .where(eq(clanMembership.userId, userId));
    return membership?.clanId ?? null;
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

  /**
   * The change is already saved, so a failure here must not become an error that the client retries (and
   * so logs twice). Count and streak achievements catch up with the next toast.
   */
  private async evaluateAchievements(
    userId: string,
    sessionId: string,
    eatenAt: Date,
  ): Promise<AchievementCode[]> {
    try {
      return await this.achievements.evaluate(userId, {
        trigger: AchievementTrigger.toast_logged,
        eatenAt,
      });
    } catch (error) {
      this.logger.error({ err: error, sessionId }, 'Could not evaluate achievements');
      return [];
    }
  }

  /** Keeps the lead toast's current photo object for the cleanup job instead of deleting it now. */
  private async discardPhoto(tx: DbExecutor, lead: ToastRow): Promise<void> {
    if (lead.photoKey === null) return;
    await tx
      .insert(discardedPhoto)
      .values({ key: lead.photoKey, toastId: lead.id })
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
      this.logger.warn({ err: error, key }, 'Could not delete the photo of a failed change');
    }
  }
}
