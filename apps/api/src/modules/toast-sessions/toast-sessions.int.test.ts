import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  type AchievementCode,
  addDays,
  localDate,
  PHOTO_MAX_BYTES,
  type ToastSession,
  type ToastSessionChangeResponse,
  type ToastSessionPage,
} from '@toasthub/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { TEST_S3 } from '../../../test/s3';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  clan,
  clanMembership,
  discardedPhoto,
  flag,
  like,
  toast,
  toastSession,
  userAchievement,
} from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import { TOAST_RATE_LIMIT } from './toast-sessions.service';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signIn(app, 'ann@example.com');
});

afterEach(async () => {
  await app.close();
});

const BOUNDARY = 'toasthub-test-boundary';
const UNKNOWN_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

interface FilePart {
  data: Buffer;
  field?: string;
}

/** A `multipart/form-data` body with text fields and an optional file part. */
function multipart(fields: Record<string, string>, file?: FilePart) {
  const parts: Buffer[] = Object.entries(fields).map(([name, value]) =>
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ),
  );
  if (file) {
    const head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.field ?? 'photo'}"; filename="toast.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
    parts.push(Buffer.from(head), file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

type Body = ReturnType<typeof multipart>;

function postSession(as: SignedIn, body?: Body) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/toast-sessions',
    headers: { cookie: as.cookie, origin: WEB_ORIGIN, ...body?.headers },
    payload: body?.payload,
  });
}

async function logSession(
  as: SignedIn,
  { count, photo }: { count?: number; photo?: Buffer } = {},
): Promise<ToastSessionChangeResponse> {
  const fields: Record<string, string> = count === undefined ? {} : { count: String(count) };
  const res = await postSession(
    as,
    count === undefined && !photo ? undefined : multipart(fields, photo && { data: photo }),
  );
  expect(res.statusCode).toBe(201);
  return res.json<ToastSessionChangeResponse>();
}

function patchCount(as: SignedIn, id: string, count: unknown) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/toast-sessions/${id}`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN },
    payload: { count },
  });
}

function putPhoto(as: SignedIn, id: string, body: Body = multipart({})) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/toast-sessions/${id}/photo`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN, ...body.headers },
    payload: body.payload,
  });
}

function deletePhoto(as: SignedIn, id: string) {
  return app.inject({
    method: 'DELETE',
    url: `/api/v1/toast-sessions/${id}/photo`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN },
  });
}

function deleteSession(as: SignedIn, id: string) {
  return app.inject({
    method: 'DELETE',
    url: `/api/v1/toast-sessions/${id}`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN },
  });
}

async function listSessions(as: SignedIn, query = ''): Promise<ToastSessionPage> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/me/toast-sessions${query}`,
    headers: { cookie: as.cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json<ToastSessionPage>();
}

/** The toasts of a session that are not deleted, lead toast first. */
function toastsOf(sessionId: string) {
  return db
    .select()
    .from(toast)
    .where(and(eq(toast.sessionId, sessionId), isNull(toast.deletedAt)))
    .orderBy(asc(toast.eatenAt), asc(toast.id));
}

/** A session `daysAgo` days back (midday in Bratislava, DST-proof), made directly in the database. */
async function pastSession(as: SignedIn, daysAgo: number): Promise<string> {
  const today = localDate(new Date());
  const [row] = await insertToasts(db, [
    { userId: as.userId, eatenAt: new Date(`${addDays(today, -daysAgo)}T10:00:00Z`) },
  ]);
  if (!row) throw new Error('No toast');
  return row.sessionId;
}

/**
 * Early bird and midnight snack depend on the hour the test runs, so tests ignore them (the unit tests of
 * the rules cover them).
 */
function withoutTimeOfDay(codes: AchievementCode[]): AchievementCode[] {
  return codes.filter((code) => code !== 'early_bird' && code !== 'midnight_snack');
}

function photo(width = 8, height = 8) {
  return sharp({ create: { width, height, channels: 3, background: '#d09050' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1', GPSMapDatum: 'WGS-84' } })
    .toBuffer();
}

async function objectExists(key: string): Promise<boolean> {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_S3.accessKeyId, secretAccessKey: TEST_S3.secretAccessKey },
  });
  try {
    await s3.send(new HeadObjectCommand({ Bucket: TEST_S3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  } finally {
    s3.destroy();
  }
}

describe('POST /toast-sessions', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/toast-sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('logs one toast without a body at the server time', async () => {
    const before = Date.now();
    const res = await postSession(ann);
    expect(res.statusCode).toBe(201);

    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toEqual({
      id: expect.any(String) as string,
      loggedAt: expect.any(String) as string,
      localDate: localDate(new Date()),
      count: 1,
      hasPhoto: false,
      photoUrl: null,
      photoHidden: false,
      editable: true,
    });
    expect(withoutTimeOfDay(body.newAchievements)).toEqual(['first_bite']);
    const loggedAt = Date.parse(body.session.loggedAt);
    expect(loggedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(loggedAt).toBeLessThanOrEqual(Date.now() + 1000);

    const rows = await toastsOf(body.session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eatenAt.getTime()).toBe(loggedAt);
  });

  it('logs several toasts as one session at the same time', async () => {
    const { session } = await logSession(ann, { count: 3 });
    expect(session.count).toBe(3);

    const rows = await toastsOf(session.id);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.eatenAt.getTime())).size).toBe(1);
    expect(rows.every((row) => row.userId === ann.userId && row.status === 'active')).toBe(true);
  });

  it('counts the toasts for the current clan', async () => {
    const [breakfast] = await db.insert(clan).values({ name: 'Breakfast Club' }).returning();
    if (!breakfast) throw new Error('No clan');
    await db
      .insert(clanMembership)
      .values({ userId: ann.userId, clanId: breakfast.id, role: 'owner' });

    const { session } = await logSession(ann, { count: 2 });
    expect((await toastsOf(session.id)).map((row) => row.clanId)).toEqual([
      breakfast.id,
      breakfast.id,
    ]);
  });

  it('stores the photo on the lead toast as WebP without EXIF', async () => {
    const { session } = await logSession(ann, { count: 2, photo: await photo(2400, 1800) });
    expect(session).toMatchObject({ count: 2, hasPhoto: true, photoHidden: false });
    expect(session.photoUrl).toMatch(/X-Amz-Expires=3600/);

    const [lead, second] = await toastsOf(session.id);
    expect(lead?.photoKey).toMatch(new RegExp(`^toasts/${ann.userId}/[0-9a-f-]{36}\\.webp$`));
    expect(second?.photoKey).toBeNull();

    const download = await fetch(session.photoUrl ?? '');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/webp');
    const metadata = await sharp(Buffer.from(await download.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 1200 });
    expect(metadata.exif).toBeUndefined();
  });

  it('accepts a multipart body without a file', async () => {
    const res = await postSession(ann, multipart({ count: '2' }));
    expect(res.statusCode).toBe(201);
    expect(res.json<ToastSessionChangeResponse>().session).toMatchObject({
      count: 2,
      photoUrl: null,
    });
  });

  it.each(['0', '11', 'two'])('rejects count=%s and saves nothing', async (count) => {
    const res = await postSession(ann, multipart({ count }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { count: expect.any(String) as string } },
    });
    expect(await db.select().from(toastSession)).toHaveLength(0);
  });

  it('rejects a file that is not a supported image, whatever its name and type say', async () => {
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    const res = await postSession(ann, multipart({ count: '3' }, { data: gif }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { photo: expect.any(String) as string } },
    });
    expect(await db.select().from(toast)).toHaveLength(0);
    expect(await db.select().from(toastSession)).toHaveLength(0);
  });

  it('rejects a photo over 10 MB', async () => {
    const huge = Buffer.concat([await photo(), Buffer.alloc(PHOTO_MAX_BYTES)]);
    const res = await postSession(ann, multipart({}, { data: huge }));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(await db.select().from(toast)).toHaveLength(0);
  });

  it('rejects a file under another field name', async () => {
    const res = await postSession(ann, multipart({}, { data: await photo(), field: 'picture' }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { fields: { picture: expect.any(String) as string } },
    });
  });

  it(`allows ${String(TOAST_RATE_LIMIT)} toasts per hour, counting each toast`, async () => {
    await logSession(ann, { count: 10 });
    await logSession(ann, { count: 10 });
    await logSession(ann, { count: 9 });

    const res = await postSession(ann, multipart({ count: '2' }));
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(await db.select().from(toast)).toHaveLength(29);
    // The refused session took nothing, so the last toast still fits.
    await logSession(ann);
    expect((await postSession(ann)).statusCode).toBe(429);

    const bob = await signIn(app, 'bob@example.com');
    expect((await postSession(bob)).statusCode).toBe(201);
  });

  it('is the only way to log: the per-toast routes are gone', async () => {
    const headers = { cookie: ann.cookie, origin: WEB_ORIGIN };
    expect((await app.inject({ method: 'POST', url: '/api/v1/toasts', headers })).statusCode).toBe(
      404,
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/toasts/${UNKNOWN_ID}`,
      headers,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('achievements', () => {
  /** Inserts countable toasts at midday in Bratislava, `daysAgo` days before today. */
  async function addPastToasts(
    daysAgo: number[],
    extra: { deletedAt?: Date; status?: 'rejected' } = {},
  ) {
    const today = localDate(new Date());
    await insertToasts(
      db,
      daysAgo.map((n) => ({
        userId: ann.userId,
        eatenAt: new Date(`${addDays(today, -n)}T10:00:00Z`),
        ...extra,
      })),
    );
  }

  async function newAchievements(options?: Parameters<typeof logSession>[1]) {
    return withoutTimeOfDay((await logSession(ann, options)).newAchievements);
  }

  it('awards first_bite once and stores it', async () => {
    expect(await newAchievements()).toEqual(['first_bite']);
    expect(await newAchievements()).toEqual([]);

    const rows = await db
      .select()
      .from(userAchievement)
      .where(eq(userAchievement.userId, ann.userId));
    expect(rows.map((row) => row.achievementCode)).toContain('first_bite');
  });

  it('awards shutterbug for the first session with a photo', async () => {
    await logSession(ann);
    expect(await newAchievements({ photo: await photo() })).toEqual(['shutterbug']);
    expect(await newAchievements({ photo: await photo() })).toEqual([]);
  });

  it('awards week_warrior when the session completes a 7-day streak', async () => {
    await addPastToasts([6, 5, 4, 3, 2, 1]);
    expect(await newAchievements()).toEqual(['first_bite', 'week_warrior']);
  });

  it('awards centurion at 100 countable toasts, also within one session', async () => {
    // Every other day, so no streak achievement gets in the way.
    await addPastToasts(Array.from({ length: 97 }, (_, i) => 2 + 2 * (i % 20)));
    await addPastToasts([1], { deletedAt: new Date() });
    await addPastToasts([1], { status: 'rejected' });
    expect(await newAchievements({ count: 2 })).toEqual(['first_bite']);
    expect(await newAchievements({ count: 2 })).toEqual(['centurion']);
  });

  it('awards centurion when raising the count reaches 100', async () => {
    await addPastToasts(Array.from({ length: 98 }, (_, i) => 2 + 2 * (i % 20)));
    const { session } = await logSession(ann);
    const res = await patchCount(ann, session.id, 2);
    expect(res.statusCode).toBe(200);
    expect(withoutTimeOfDay(res.json<ToastSessionChangeResponse>().newAchievements)).toEqual([
      'centurion',
    ]);
  });

  it('awards shutterbug when a photo is added later', async () => {
    const { session } = await logSession(ann);
    const res = await putPhoto(ann, session.id, multipart({}, { data: await photo() }));
    expect(res.statusCode).toBe(200);
    expect(res.json<ToastSessionChangeResponse>().newAchievements).toEqual(['shutterbug']);
  });

  it('keeps earned achievements when the session is deleted', async () => {
    const { session } = await logSession(ann);
    expect((await deleteSession(ann, session.id)).statusCode).toBe(204);

    const rows = await db
      .select()
      .from(userAchievement)
      .where(eq(userAchievement.userId, ann.userId));
    expect(rows.map((row) => row.achievementCode)).toContain('first_bite');
    expect(await newAchievements()).toEqual([]);
  });
});

describe('count threshold flag', () => {
  async function countFlags() {
    return db.select().from(flag).where(eq(flag.subjectUserId, ann.userId));
  }

  it('is opened once when the day goes over the threshold', async () => {
    await app.get(SettingsService).set({ flagDailyThreshold: 2 });

    await logSession(ann, { count: 2 });
    expect(await countFlags()).toHaveLength(0);

    await logSession(ann, { count: 2 });
    await logSession(ann);
    const flags = await countFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      type: 'count_threshold',
      localDate: localDate(new Date()),
      toastId: null,
      status: 'open',
    });
    // The toasts over the threshold still count (BR-MOD-2).
    const rows = await db.select().from(toast).where(eq(toast.userId, ann.userId));
    expect(rows.map((row) => row.status)).toEqual(Array<string>(5).fill('active'));
  });

  it('is opened when raising a count goes over it', async () => {
    await app.get(SettingsService).set({ flagDailyThreshold: 2 });
    const { session } = await logSession(ann, { count: 2 });

    expect((await patchCount(ann, session.id, 3)).statusCode).toBe(200);
    expect(await countFlags()).toHaveLength(1);
  });

  it('ignores deleted toasts', async () => {
    await app.get(SettingsService).set({ flagDailyThreshold: 1 });

    const { session } = await logSession(ann);
    expect((await deleteSession(ann, session.id)).statusCode).toBe(204);
    await logSession(ann);
    expect(await countFlags()).toHaveLength(0);

    await logSession(ann);
    expect(await countFlags()).toHaveLength(1);
  });
});

describe('GET /me/toast-sessions', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/toast-sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('lists only the own sessions that are not deleted, newest first', async () => {
    const bob = await signIn(app, 'bob@example.com');
    const older = await pastSession(ann, 3);
    const yesterday = await pastSession(ann, 1);
    const { session: today } = await logSession(ann, { count: 3, photo: await photo() });
    const { session: deleted } = await logSession(ann);
    await deleteSession(ann, deleted.id);
    await logSession(bob);

    const page = await listSessions(ann);
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((s) => s.id)).toEqual([today.id, yesterday, older]);
    // Presigned again per request, so the URL differs from the one in the POST response.
    expect(page.items[0]).toEqual({
      ...today,
      photoUrl: expect.stringMatching(/X-Amz-Expires=3600/) as string,
    });
    expect(page.items[1]).toMatchObject({
      localDate: addDays(localDate(new Date()), -1),
      count: 1,
      hasPhoto: false,
      editable: false,
    });
  });

  it('pages with a cursor, also through sessions logged at the same instant', async () => {
    const at = new Date(Date.now() - 60_000);
    await insertToasts(
      db,
      Array.from({ length: 3 }, () => ({ userId: ann.userId, eatenAt: at })),
    );
    await logSession(ann);
    await logSession(ann);

    const first = await listSessions(ann, '?limit=2');
    expect(first.items).toHaveLength(2);
    const second = await listSessions(ann, `?limit=2&cursor=${first.nextCursor ?? ''}`);
    expect(second.items).toHaveLength(2);
    const third = await listSessions(ann, `?limit=2&cursor=${second.nextCursor ?? ''}`);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items, ...third.items].map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual((await listSessions(ann, '?limit=5')).items.map((s) => s.id));
  });

  it('rejects a bad cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/toast-sessions?cursor=nonsense',
      headers: { cookie: ann.cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { fields: { cursor: 'Invalid cursor' } } });
  });

  it('marks sessions with a rejected toast or a hidden photo', async () => {
    const { session: rejected } = await logSession(ann, { count: 2 });
    const [, second] = await toastsOf(rejected.id);
    await db
      .update(toast)
      .set({ status: 'rejected' })
      .where(eq(toast.id, second?.id ?? ''));
    const { session: hidden } = await logSession(ann, { photo: await photo() });
    await db.update(toast).set({ photoHiddenAt: new Date() }).where(eq(toast.sessionId, hidden.id));

    const { items } = await listSessions(ann);
    expect(items.find((s) => s.id === rejected.id)).toMatchObject({ count: 2, editable: false });
    expect(items.find((s) => s.id === hidden.id)).toMatchObject({
      hasPhoto: true,
      photoUrl: null,
      photoHidden: true,
      editable: true,
    });
  });
});

describe('PATCH /toast-sessions/:id', () => {
  it('raises the count with toasts eaten now', async () => {
    const { session } = await logSession(ann);
    const res = await patchCount(ann, session.id, 4);
    expect(res.statusCode).toBe(200);
    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toMatchObject({ id: session.id, count: 4, loggedAt: session.loggedAt });

    const [lead, ...added] = await toastsOf(session.id);
    expect(added).toHaveLength(3);
    for (const row of added) {
      expect(row.eatenAt.getTime()).toBeGreaterThanOrEqual(lead?.eatenAt.getTime() ?? 0);
      expect(row.localDate).toBe(session.localDate);
    }
  });

  it('lowers the count by removing the newest toasts, keeping the lead toast and its photo', async () => {
    const bob = await signIn(app, 'bob@example.com');
    const { session } = await logSession(ann, { count: 3, photo: await photo() });
    const [lead, second, third] = await toastsOf(session.id);
    await db.insert(like).values([
      { toastId: lead?.id ?? '', userId: bob.userId },
      { toastId: third?.id ?? '', userId: bob.userId },
    ]);

    const res = await patchCount(ann, session.id, 1);
    expect(res.statusCode).toBe(200);
    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toMatchObject({ count: 1, hasPhoto: true });
    expect(body.session.photoUrl).toMatch(/X-Amz-Expires=3600/);
    expect(body.newAchievements).toEqual([]);

    const left = await toastsOf(session.id);
    expect(left.map((row) => row.id)).toEqual([lead?.id]);
    expect(left[0]?.photoKey).toBe(lead?.photoKey);
    const removed = await db
      .select()
      .from(toast)
      .where(eq(toast.id, second?.id ?? ''));
    expect(removed[0]?.deletedAt).toBeInstanceOf(Date);
    expect((await db.select().from(like)).map((row) => row.toastId)).toEqual([lead?.id]);
  });

  it("is a conflict on yesterday's session", async () => {
    const sessionId = await pastSession(ann, 1);
    const res = await patchCount(ann, sessionId, 2);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(await toastsOf(sessionId)).toHaveLength(1);
  });

  it('is a conflict once an admin rejected a toast in it', async () => {
    const { session } = await logSession(ann, { count: 2 });
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.sessionId, session.id));
    expect((await patchCount(ann, session.id, 3)).statusCode).toBe(409);
  });

  it("refuses someone else's session", async () => {
    const bob = await signIn(app, 'bob@example.com');
    const { session } = await logSession(ann);
    const res = await patchCount(bob, session.id, 2);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await toastsOf(session.id)).toHaveLength(1);
  });

  it('returns 404 for an unknown or deleted session and 400 for a bad count', async () => {
    expect((await patchCount(ann, UNKNOWN_ID, 2)).statusCode).toBe(404);
    const { session } = await logSession(ann);
    for (const count of [0, 11, '2']) {
      expect((await patchCount(ann, session.id, count)).statusCode).toBe(400);
    }
    await deleteSession(ann, session.id);
    expect((await patchCount(ann, session.id, 2)).statusCode).toBe(404);
    expect((await patchCount(ann, 'not-a-uuid', 2)).statusCode).toBe(400);
  });

  it('counts added toasts toward the hourly limit', async () => {
    await logSession(ann, { count: 10 });
    await logSession(ann, { count: 10 });
    const { session } = await logSession(ann, { count: 8 });

    const res = await patchCount(ann, session.id, 10);
    expect(res.statusCode).toBe(200);
    const same = await patchCount(ann, session.id, 10);
    expect(same.statusCode).toBe(200);
    expect((await patchCount(ann, session.id, 9)).statusCode).toBe(200);
    // Lowering is free, but raising again would be toast 31.
    expect((await patchCount(ann, session.id, 10)).statusCode).toBe(429);
    expect(await toastsOf(session.id)).toHaveLength(9);
  });
});

describe('PUT /toast-sessions/:id/photo', () => {
  it('adds a photo to the lead toast', async () => {
    const { session } = await logSession(ann, { count: 2 });
    const res = await putPhoto(ann, session.id, multipart({}, { data: await photo() }));
    expect(res.statusCode).toBe(200);
    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toMatchObject({ count: 2, hasPhoto: true });
    expect(body.session.photoUrl).toMatch(/X-Amz-Expires=3600/);

    const [lead, second] = await toastsOf(session.id);
    expect(lead?.photoKey).toMatch(/\.webp$/);
    expect(second?.photoKey).toBeNull();
  });

  it('replaces a photo and keeps the old object for the cleanup job', async () => {
    const { session } = await logSession(ann, { photo: await photo() });
    const [before] = await toastsOf(session.id);
    const oldKey = before?.photoKey ?? '';

    const res = await putPhoto(ann, session.id, multipart({}, { data: await photo(16, 16) }));
    expect(res.statusCode).toBe(200);
    const [after] = await toastsOf(session.id);
    expect(after?.photoKey).not.toBe(oldKey);
    expect(await db.select().from(discardedPhoto)).toEqual([
      { key: oldKey, toastId: before?.id, createdAt: expect.any(Date) as Date },
    ]);
    expect(await objectExists(oldKey)).toBe(true);
  });

  it('is a conflict when an admin hid the photo', async () => {
    const { session } = await logSession(ann, { photo: await photo() });
    await db
      .update(toast)
      .set({ photoHiddenAt: new Date() })
      .where(eq(toast.sessionId, session.id));

    const res = await putPhoto(ann, session.id, multipart({}, { data: await photo() }));
    expect(res.statusCode).toBe(409);
  });

  it("is a conflict on yesterday's session and forbidden on someone else's", async () => {
    const bob = await signIn(app, 'bob@example.com');
    const yesterday = await pastSession(ann, 1);
    expect(
      (await putPhoto(ann, yesterday, multipart({}, { data: await photo() }))).statusCode,
    ).toBe(409);
    const { session } = await logSession(ann);
    expect(
      (await putPhoto(bob, session.id, multipart({}, { data: await photo() }))).statusCode,
    ).toBe(403);
    expect(
      (await putPhoto(ann, UNKNOWN_ID, multipart({}, { data: await photo() }))).statusCode,
    ).toBe(404);
  });

  it('needs a readable photo', async () => {
    const { session } = await logSession(ann);
    const missing = await putPhoto(ann, session.id);
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: { fields: { photo: 'Required' } } });

    const bad = await putPhoto(
      ann,
      session.id,
      multipart({}, { data: Buffer.from('not an image') }),
    );
    expect(bad.statusCode).toBe(400);
    expect((await toastsOf(session.id))[0]?.photoKey).toBeNull();
  });
});

describe('DELETE /toast-sessions/:id/photo', () => {
  it('removes the photo and keeps the object for the cleanup job', async () => {
    const { session } = await logSession(ann, { photo: await photo() });
    const [lead] = await toastsOf(session.id);

    const res = await deletePhoto(ann, session.id);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ session: ToastSession }>().session).toMatchObject({
      hasPhoto: false,
      photoUrl: null,
    });
    expect((await toastsOf(session.id))[0]?.photoKey).toBeNull();
    expect((await db.select().from(discardedPhoto)).map((row) => row.key)).toEqual([
      lead?.photoKey,
    ]);
    // Nothing left to remove: still fine.
    expect((await deletePhoto(ann, session.id)).statusCode).toBe(200);
  });

  it('removes a hidden photo, after which no photo can be added', async () => {
    const { session } = await logSession(ann, { photo: await photo() });
    await db
      .update(toast)
      .set({ photoHiddenAt: new Date() })
      .where(eq(toast.sessionId, session.id));

    const res = await deletePhoto(ann, session.id);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ session: ToastSession }>().session).toMatchObject({
      hasPhoto: false,
      photoHidden: true,
    });
    expect(
      (await putPhoto(ann, session.id, multipart({}, { data: await photo() }))).statusCode,
    ).toBe(409);
  });

  it("is a conflict on yesterday's session and forbidden on someone else's", async () => {
    const bob = await signIn(app, 'bob@example.com');
    expect((await deletePhoto(ann, await pastSession(ann, 1))).statusCode).toBe(409);
    const { session } = await logSession(ann, { photo: await photo() });
    expect((await deletePhoto(bob, session.id)).statusCode).toBe(403);
  });
});

describe('DELETE /toast-sessions/:id', () => {
  it('soft-deletes the session with its toasts and removes their likes', async () => {
    const bob = await signIn(app, 'bob@example.com');
    const { session } = await logSession(ann, { count: 2, photo: await photo() });
    const [lead] = await toastsOf(session.id);
    await db.insert(like).values({ toastId: lead?.id ?? '', userId: bob.userId });

    expect((await deleteSession(ann, session.id)).statusCode).toBe(204);

    const [row] = await db.select().from(toastSession).where(eq(toastSession.id, session.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    const rows = await db.select().from(toast).where(eq(toast.sessionId, session.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.deletedAt instanceof Date)).toBe(true);
    // The photo stays for the moderation trail (SPEC §12 D7).
    expect(rows.find((r) => r.id === lead?.id)?.photoKey).toBe(lead?.photoKey);
    expect(await db.select().from(like)).toHaveLength(0);
    expect((await listSessions(ann)).items).toHaveLength(0);

    expect((await deleteSession(ann, session.id)).statusCode).toBe(404);
  });

  it('takes the toasts out of the home count', async () => {
    const { session } = await logSession(ann, { count: 3 });
    await deleteSession(ann, session.id);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/home',
      headers: { cookie: ann.cookie },
    });
    expect(res.json()).toMatchObject({ todayCount: 0, streak: { current: 0 } });
  });

  it("is a conflict on yesterday's session and forbidden on someone else's", async () => {
    const bob = await signIn(app, 'bob@example.com');
    const yesterday = await pastSession(ann, 1);
    expect((await deleteSession(ann, yesterday)).statusCode).toBe(409);
    expect(await toastsOf(yesterday)).toHaveLength(1);

    const { session } = await logSession(ann);
    const res = await deleteSession(bob, session.id);
    expect(res.statusCode).toBe(403);
    expect(await toastsOf(session.id)).toHaveLength(1);
    expect((await deleteSession(ann, UNKNOWN_ID)).statusCode).toBe(404);
  });
});
