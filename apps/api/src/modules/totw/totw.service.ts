import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AchievementTrigger,
  addDays,
  dayNumber,
  type LocalDate,
  localDate,
  localDateSchema,
  type PageQuery,
  ProfileVisibility,
  type ToastOfTheWeek,
  type ToastOfTheWeekPage,
  ToastOfTheWeekStatus,
} from '@toasthub/shared';
import { and, desc, eq, gte, isNotNull, isNull, lt, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error';
import { decodeCursor, toPage } from '../../common/pagination';
import { type Database, DB } from '../../db/db.module';
import { toast, toastOfTheWeek, user } from '../../db/schema';
import { AchievementsService } from '../achievements/achievements.service';
import { StorageService } from '../storage/storage.service';
import { countableToasts } from '../toasts/countable-toasts';
import { canSeePhoto } from '../users/users.policy';
import {
  hasWeekEnded,
  isMonday,
  pickWinner,
  previousWeekStart,
  type RandomIndex,
} from './totw-draw';

/** The random source of the draw; tests replace it. */
export const TOTW_RANDOM = Symbol('TOTW_RANDOM');

export interface DrawOptions {
  // The admin who redraws; null for the scheduled job.
  drawnBy?: string | null;
  // Replace a week that is already drawn (the admin's redraw). Without it, a drawn week is kept, so a
  // retried job never changes the winner.
  replace?: boolean;
}

export interface DrawResult {
  weekStart: LocalDate;
  // The winning toast; null when nothing was eligible.
  toastId: string | null;
}

const keysetSchema = z.object({ weekStart: localDateSchema });

// Key of the advisory lock that serializes draws of one week (the scheduled job and an admin's redraw).
const DRAW_LOCK = 'toast_of_the_week';

/** The weekly draw and its history (SPEC §4.10). */
@Injectable()
export class TotwService {
  private readonly logger = new Logger(TotwService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(TOTW_RANDOM) private readonly randomIndex: RandomIndex,
    private readonly achievements: AchievementsService,
    private readonly storage: StorageService,
  ) {}

  /** The scheduled Monday draw: last week, unless it is drawn already. */
  async drawPreviousWeek(now = new Date()): Promise<DrawResult> {
    return this.draw(previousWeekStart(localDate(now)));
  }

  /**
   * Picks one eligible toast of the week starting on `weekStart` uniformly at random and records it,
   * or records that there was none. Eligible: a photo that is not hidden on a countable toast (not
   * deleted, not rejected, owner active) eaten that week, whatever the owner's profile visibility. The
   * winner earns `golden_toast`.
   */
  async draw(
    weekStart: LocalDate,
    { drawnBy = null, replace = false }: DrawOptions = {},
  ): Promise<DrawResult> {
    if (!isMonday(weekStart)) {
      throw new AppError('VALIDATION_ERROR', 'Request validation failed', {
        weekStart: 'Must be a Monday',
      });
    }
    if (!hasWeekEnded(weekStart, localDate(new Date()))) {
      throw new AppError('CONFLICT', 'The week has not ended yet');
    }

    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${DRAW_LOCK}), ${dayNumber(weekStart)})`,
      );
      if (!replace) {
        const [drawn] = await tx
          .select({ toastId: toastOfTheWeek.toastId, userId: toast.userId })
          .from(toastOfTheWeek)
          .leftJoin(toast, eq(toast.id, toastOfTheWeek.toastId))
          .where(eq(toastOfTheWeek.weekStart, weekStart));
        if (drawn) return { ...drawn, fresh: false };
      }

      const candidates = await tx
        .select({ id: toast.id, userId: toast.userId })
        .from(toast)
        .where(
          and(
            isNotNull(toast.photoKey),
            isNull(toast.photoHiddenAt),
            gte(toast.localDate, weekStart),
            lt(toast.localDate, addDays(weekStart, 7)),
            countableToasts(),
          ),
        )
        // A fixed order, so the same random index always picks the same toast.
        .orderBy(toast.id);
      const winner = pickWinner(candidates, this.randomIndex);
      const toastId = winner?.id ?? null;
      await tx
        .insert(toastOfTheWeek)
        .values({ weekStart, toastId, drawnBy })
        .onConflictDoUpdate({
          target: toastOfTheWeek.weekStart,
          set: { toastId, drawnBy, drawnAt: sql`now()` },
        });
      return { toastId, userId: winner?.userId ?? null, fresh: true };
    });

    if (result.fresh) {
      this.logger.log({ weekStart, toastId: result.toastId, drawnBy }, 'Toast of the week drawn');
    }
    // Also for a week drawn before: if the award failed then, the retried job catches up here. A failure
    // fails the job, so it is retried.
    if (result.userId) {
      await this.achievements.evaluate(result.userId, { trigger: AchievementTrigger.totw_won });
    }
    return { weekStart, toastId: result.toastId };
  }

  /** An admin's redraw (SPEC §4.13): replaces the week's winner, or draws it for the first time. */
  async redraw(adminId: string, weekStart: LocalDate): Promise<ToastOfTheWeek> {
    await this.draw(weekStart, { replace: true, drawnBy: adminId });
    const entry = await this.forWeek(adminId, weekStart);
    if (!entry) throw new Error('Toast of the week disappeared after a redraw');
    return entry;
  }

  /** The draw for one week as the viewer sees it; null while the week isn't drawn. */
  async forWeek(viewerId: string, weekStart: LocalDate): Promise<ToastOfTheWeek | null> {
    const [row] = await this.rows(eq(toastOfTheWeek.weekStart, weekStart), 1);
    return row ? this.toEntry(viewerId, row) : null;
  }

  /** Last week's draw, which the home screen shows all week. */
  async lastWeek(viewerId: string, today: LocalDate): Promise<ToastOfTheWeek | null> {
    return this.forWeek(viewerId, previousWeekStart(today));
  }

  /** Every drawn week, newest first. */
  async history(viewerId: string, { cursor, limit }: PageQuery): Promise<ToastOfTheWeekPage> {
    const after = cursor === undefined ? null : decodeCursor(cursor, keysetSchema);
    const rows = await this.rows(
      after ? lt(toastOfTheWeek.weekStart, after.weekStart) : undefined,
      limit + 1,
    );
    const page = toPage(rows, limit, (row) => ({ weekStart: row.weekStart }));
    return {
      items: await Promise.all(page.items.map((row) => this.toEntry(viewerId, row))),
      nextCursor: page.nextCursor,
    };
  }

  private rows(where: SQL | undefined, limit: number) {
    return this.db
      .select({
        weekStart: toastOfTheWeek.weekStart,
        toastId: toast.id,
        eatenAt: toast.eatenAt,
        photoKey: toast.photoKey,
        photoHiddenAt: toast.photoHiddenAt,
        countable: sql<boolean>`${countableToasts()}`,
        userId: user.id,
        displayName: user.displayName,
        avatarId: user.avatarId,
        profileVisibility: user.profileVisibility,
      })
      .from(toastOfTheWeek)
      .leftJoin(toast, eq(toast.id, toastOfTheWeek.toastId))
      .leftJoin(user, eq(user.id, toast.userId))
      .where(where)
      .orderBy(desc(toastOfTheWeek.weekStart))
      .limit(limit);
  }

  private async toEntry(
    viewerId: string,
    row: Awaited<ReturnType<TotwService['rows']>>[number],
  ): Promise<ToastOfTheWeek> {
    const { weekStart } = row;
    // No toast: nothing was eligible. (A winner's row is only lost when its owner is deleted, which v1
    // never does, Q1.)
    if (row.toastId === null || row.userId === null || row.eatenAt === null) {
      return { weekStart, status: ToastOfTheWeekStatus.none, toast: null };
    }
    // A winner is shown to everyone (BR-TOTW-2), so clans and visibility don't change the answer.
    const visible = canSeePhoto(
      { userId: viewerId, clanId: null },
      {
        owner: {
          userId: row.userId,
          profileVisibility: row.profileVisibility ?? ProfileVisibility.public,
          clanId: null,
        },
        hasPhoto: row.photoKey !== null,
        hidden: row.photoHiddenAt !== null,
        removed: !row.countable,
        wonToastOfTheWeek: true,
      },
    );
    if (!visible || row.photoKey === null) {
      return { weekStart, status: ToastOfTheWeekStatus.removed, toast: null };
    }
    return {
      weekStart,
      status: ToastOfTheWeekStatus.won,
      toast: {
        id: row.toastId,
        user: { id: row.userId, displayName: row.displayName ?? '', avatarId: row.avatarId },
        eatenAt: row.eatenAt.toISOString(),
        photoUrl: await this.storage.presignGet(row.photoKey),
      },
    };
  }
}
