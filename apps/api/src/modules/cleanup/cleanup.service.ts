import { Inject, Injectable } from '@nestjs/common';
import { FlagStatus, FlagType } from '@toasthub/shared';
import { and, eq, isNotNull, lt, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { type Database, DB } from '../../db/db.module';
import { discardedPhoto, flag, toast, verification } from '../../db/schema';
import { StorageService } from '../storage/storage.service';

/** How long the photo of a deleted toast and a replaced or removed photo stay in storage (SPEC §12 D51). */
export const PHOTO_RETENTION_DAYS = 30;

// Rows handled per query; a run continues until nothing is left.
const BATCH_SIZE = 100;

/** Removes data nobody can reach any more. Runs in the worker's daily jobs. */
@Injectable()
export class CleanupService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
  ) {}

  /** Deletes expired magic-link tokens; Better Auth removes only the ones that are used. */
  async deleteExpiredVerifications(): Promise<number> {
    const deleted = await this.db
      .delete(verification)
      .where(lt(verification.expiresAt, sql`now()`))
      .returning({ id: verification.id });
    return deleted.length;
  }

  /**
   * Deletes the stored photos of toasts deleted, and of photos replaced or removed in a toast session,
   * more than `PHOTO_RETENTION_DAYS` ago, unless an open photo report on the toast still needs them for
   * review. Returns the number of objects deleted. The object goes first, so a failed delete is retried
   * by the next run.
   */
  async deleteOldPhotos(): Promise<number> {
    let deleted = 0;
    for (;;) {
      const rows = await this.db
        .select({ id: toast.id, key: toast.photoKey })
        .from(toast)
        .where(
          and(
            isNotNull(toast.photoKey),
            olderThanRetention(toast.deletedAt),
            noOpenReport(toast.id),
          ),
        )
        .orderBy(toast.id)
        .limit(BATCH_SIZE);
      for (const row of rows) {
        if (row.key === null) continue;
        await this.storage.delete(row.key);
        await this.db.update(toast).set({ photoKey: null }).where(eq(toast.id, row.id));
        deleted++;
      }
      if (rows.length < BATCH_SIZE) break;
    }
    for (;;) {
      const rows = await this.db
        .select({ key: discardedPhoto.key })
        .from(discardedPhoto)
        .where(
          and(olderThanRetention(discardedPhoto.createdAt), noOpenReport(discardedPhoto.toastId)),
        )
        .orderBy(discardedPhoto.key)
        .limit(BATCH_SIZE);
      for (const row of rows) {
        await this.storage.delete(row.key);
        await this.db.delete(discardedPhoto).where(eq(discardedPhoto.key, row.key));
        deleted++;
      }
      if (rows.length < BATCH_SIZE) break;
    }
    return deleted;
  }
}

function olderThanRetention(at: AnyPgColumn): SQL {
  return sql`${at} < now() - make_interval(days => ${PHOTO_RETENTION_DAYS})`;
}

// An admin reviewing a report looks at the photo, also one replaced or removed since (SPEC §12 D44).
function noOpenReport(toastId: AnyPgColumn): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${flag}
    WHERE ${flag.toastId} = ${toastId}
      AND ${flag.type} = ${FlagType.photo_report}
      AND ${flag.status} = ${FlagStatus.open}
  )`;
}
