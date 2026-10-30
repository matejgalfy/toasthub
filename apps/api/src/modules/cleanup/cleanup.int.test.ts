import { randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../../../test/create-app';
import { objectExists } from '../../../test/s3';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { discardedPhoto, flag, toast, user, verification } from '../../db/schema';
import { StorageService } from '../storage/storage.service';
import { CleanupService, PHOTO_RETENTION_DAYS } from './cleanup.service';

let app: NestFastifyApplication;
let db: Database;
let cleanup: CleanupService;
let storage: StorageService;
let userId: string;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  storage = app.get(StorageService, { strict: false });
  // Only the worker has the cleanup module.
  cleanup = new CleanupService(db, storage);
  const [row] = await db
    .insert(user)
    .values({ displayName: 'Ann', email: 'ann@example.com' })
    .returning({ id: user.id });
  if (!row) throw new Error('No user');
  userId = row.id;
});

afterEach(async () => {
  await app.close();
});

const DAY_MS = 86_400_000;
const expired = () => new Date(Date.now() - (PHOTO_RETENTION_DAYS + 1) * DAY_MS);
const recent = () => new Date(Date.now() - (PHOTO_RETENTION_DAYS - 1) * DAY_MS);

/** Stores an object under a fresh key; objects outlive the truncate between tests. */
async function storedPhoto(): Promise<string> {
  const key = `toasts/cleanup-test/${randomUUID()}.webp`;
  await storage.put(key, Buffer.from('photo'), 'image/webp');
  return key;
}

async function photoToast(deletedAt: Date | null) {
  const [row] = await insertToasts(db, [
    { userId, eatenAt: expired(), photoKey: await storedPhoto(), deletedAt },
  ]);
  if (!row?.photoKey) throw new Error('No toast');
  return { id: row.id, key: row.photoKey };
}

async function discarded(createdAt: Date) {
  const lead = await photoToast(null);
  const key = await storedPhoto();
  await db.insert(discardedPhoto).values({ key, toastId: lead.id, createdAt });
  return { toastId: lead.id, key };
}

async function report(toastId: string, status: 'open' | 'dismissed') {
  await db.insert(flag).values({ type: 'photo_report', subjectUserId: userId, toastId, status });
}

async function photoKeyOf(id: string): Promise<string | null | undefined> {
  const [row] = await db.select({ key: toast.photoKey }).from(toast).where(eq(toast.id, id));
  return row?.key;
}

describe('CleanupService.deleteExpiredVerifications', () => {
  it('deletes only expired magic-link tokens', async () => {
    await db.insert(verification).values([
      { identifier: 'old', value: 'x', expiresAt: new Date(Date.now() - 60_000) },
      { identifier: 'valid', value: 'y', expiresAt: new Date(Date.now() + 60_000) },
    ]);
    expect(await cleanup.deleteExpiredVerifications()).toBe(1);
    const left = await db.select({ identifier: verification.identifier }).from(verification);
    expect(left).toEqual([{ identifier: 'valid' }]);
  });
});

describe('CleanupService.deleteOldPhotos', () => {
  it('deletes the photos of toasts deleted longer ago than the retention', async () => {
    const old = await photoToast(expired());
    const fresh = await photoToast(recent());
    const kept = await photoToast(null);

    expect(await cleanup.deleteOldPhotos()).toBe(1);
    expect(await objectExists(old.key)).toBe(false);
    expect(await photoKeyOf(old.id)).toBeNull();
    for (const t of [fresh, kept]) {
      expect(await objectExists(t.key)).toBe(true);
      expect(await photoKeyOf(t.id)).toBe(t.key);
    }
  });

  it('deletes replaced and removed photos longer ago than the retention', async () => {
    const old = await discarded(expired());
    const fresh = await discarded(recent());

    expect(await cleanup.deleteOldPhotos()).toBe(1);
    expect(await objectExists(old.key)).toBe(false);
    expect(await objectExists(fresh.key)).toBe(true);
    const left = await db.select({ key: discardedPhoto.key }).from(discardedPhoto);
    expect(left).toEqual([{ key: fresh.key }]);
  });

  it('keeps photos an open report still needs', async () => {
    const reported = await photoToast(expired());
    await report(reported.id, 'open');
    const dismissed = await photoToast(expired());
    await report(dismissed.id, 'dismissed');
    const replaced = await discarded(expired());
    await report(replaced.toastId, 'open');

    expect(await cleanup.deleteOldPhotos()).toBe(1);
    expect(await objectExists(reported.key)).toBe(true);
    expect(await objectExists(replaced.key)).toBe(true);
    expect(await objectExists(dismissed.key)).toBe(false);
  });

  it('handles more photos than one batch', async () => {
    const toasts = await insertToasts(
      db,
      Array.from({ length: 105 }, (_, i) => ({
        userId,
        eatenAt: expired(),
        // Never stored: deleting a missing object succeeds.
        photoKey: `toasts/cleanup-test/missing-${String(i)}-${randomUUID()}.webp`,
        deletedAt: expired(),
      })),
    );
    expect(await cleanup.deleteOldPhotos()).toBe(toasts.length);
    expect(await cleanup.deleteOldPhotos()).toBe(0);
  });
});
