import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  type AchievementCode,
  addDays,
  localDate,
  PHOTO_MAX_BYTES,
  TOAST_SESSION_DESCRIPTION_MAX_LENGTH,
  type ToastSessionChangeResponse,
  type ToastSessionPage,
} from '@toasthub/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { objectExists } from '../../../test/s3';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import {
  clan,
  clanMembership,
  discardedPhoto,
  flag,
  like,
  rateLimit,
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

/** A log body with the photo every session needs (BR-TOAST-2). */
async function withPhoto(fields: Record<string, string> = {}, data?: Buffer): Promise<Body> {
  return multipart(fields, { data: data ?? (await photo()) });
}

async function logSession(
  as: SignedIn,
  {
    count,
    photo: data,
    description,
  }: { count?: number; photo?: Buffer; description?: string } = {},
): Promise<ToastSessionChangeResponse> {
  const fields: Record<string, string> = count === undefined ? {} : { count: String(count) };
  if (description !== undefined) fields.description = description;
  const res = await postSession(as, await withPhoto(fields, data));
  expect(res.statusCode).toBe(201);
  return res.json<ToastSessionChangeResponse>();
}

/** One of today's sessions without a photo, as logged before photos were required (SPEC §12 D64). */
async function photolessSession(as: SignedIn): Promise<string> {
  const [row] = await insertToasts(db, [{ userId: as.userId, eatenAt: new Date() }]);
  if (!row) throw new Error('No toast');
  return row.sessionId;
}

function patchCount(as: SignedIn, id: string, count: unknown) {
  return patchSession(as, id, { count });
}

function patchSession(as: SignedIn, id: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/toast-sessions/${id}`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN },
    payload,
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

describe('POST /toast-sessions', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/toast-sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('logs one toast with its photo at the server time', async () => {
    const before = Date.now();
    const res = await postSession(ann, await withPhoto());
    expect(res.statusCode).toBe(201);

    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toEqual({
      id: expect.any(String) as string,
      loggedAt: expect.any(String) as string,
      localDate: localDate(new Date()),
      count: 1,
      description: null,
      hasPhoto: true,
      photoUrl: expect.stringMatching(/X-Amz-Expires=3600/) as string,
      photoHidden: false,
      editable: true,
    });
    expect(withoutTimeOfDay(body.newAchievements)).toEqual(['first_bite', 'shutterbug']);
    const loggedAt = Date.parse(body.session.loggedAt);
    expect(loggedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(loggedAt).toBeLessThanOrEqual(Date.now() + 1000);

    const rows = await toastsOf(body.session.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eatenAt.getTime()).toBe(loggedAt);
  });

  it('trims a plain-text description and returns it in own history (BR-TOAST-8)', async () => {
    const { session } = await logSession(ann, { description: '  <b>Breakfast</b>\nWith coffee  ' });
    expect(session.description).toBe('<b>Breakfast</b>\nWith coffee');
    const [stored] = await db.select().from(toastSession).where(eq(toastSession.id, session.id));
    expect(stored?.description).toBe(session.description);
    expect((await listSessions(ann)).items[0]?.description).toBe(session.description);
  });

  it('stores a blank description as null', async () => {
    const { session } = await logSession(ann, { description: ' \n\t ' });
    expect(session.description).toBeNull();
    const [stored] = await db.select().from(toastSession).where(eq(toastSession.id, session.id));
    expect(stored?.description).toBeNull();
  });

  it('accepts 500 trimmed characters and rejects a longer description before taking quota', async () => {
    const description = 'a'.repeat(TOAST_SESSION_DESCRIPTION_MAX_LENGTH);
    const rejected = await postSession(ann, await withPhoto({ description: `${description}a` }));
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { description: expect.any(String) as string } },
    });
    expect(await db.select().from(toastSession)).toHaveLength(0);
    const { session } = await logSession(ann, { count: 10, description: `  ${description}  ` });
    expect(session.description).toBe(description);
    await logSession(ann, { count: 10 });
    await logSession(ann, { count: 10 });
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

  it('refuses a log without a photo and saves nothing (BR-TOAST-2)', async () => {
    for (const body of [undefined, multipart({ count: '2' })]) {
      const res = await postSession(ann, body);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR', fields: { photo: 'Required' } },
      });
    }
    expect(await db.select().from(toastSession)).toHaveLength(0);
  });

  it('takes no quota for a log refused for a missing photo', async () => {
    for (let i = 0; i < TOAST_RATE_LIMIT; i++) {
      expect((await postSession(ann)).statusCode).toBe(400);
    }
    await logSession(ann);
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

    const res = await postSession(ann, await withPhoto({ count: '2' }));
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(await db.select().from(toast)).toHaveLength(29);
    // The refused session took nothing, so the last toast still fits.
    await logSession(ann);
    expect((await postSession(ann, await withPhoto())).statusCode).toBe(429);

    const bob = await signIn(app, 'bob@example.com');
    expect((await postSession(bob, await withPhoto())).statusCode).toBe(201);
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

  it('awards first_bite and shutterbug (every log has a photo) once and stores them', async () => {
    expect(await newAchievements()).toEqual(['first_bite', 'shutterbug']);
    expect(await newAchievements()).toEqual([]);

    const rows = await db
      .select()
      .from(userAchievement)
      .where(eq(userAchievement.userId, ann.userId));
    expect(rows.map((row) => row.achievementCode)).toEqual(
      expect.arrayContaining(['first_bite', 'shutterbug']),
    );
  });

  it('awards week_warrior when the session completes a 7-day streak', async () => {
    await addPastToasts([6, 5, 4, 3, 2, 1]);
    expect(await newAchievements()).toEqual(['first_bite', 'shutterbug', 'week_warrior']);
  });

  it('awards centurion at 100 countable toasts, also within one session', async () => {
    // Every other day, so no streak achievement gets in the way.
    await addPastToasts(Array.from({ length: 97 }, (_, i) => 2 + 2 * (i % 20)));
    await addPastToasts([1], { deletedAt: new Date() });
    await addPastToasts([1], { status: 'rejected' });
    expect(await newAchievements({ count: 2 })).toEqual(['first_bite', 'shutterbug']);
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

  it('awards shutterbug when a photo is added to a session from before photos were required', async () => {
    const sessionId = await photolessSession(ann);
    const res = await putPhoto(ann, sessionId, multipart({}, { data: await photo() }));
    expect(res.statusCode).toBe(200);
    // The inserted session earned nothing yet, so the photo also brings first_bite.
    expect(withoutTimeOfDay(res.json<ToastSessionChangeResponse>().newAchievements)).toEqual([
      'first_bite',
      'shutterbug',
    ]);
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
  it.each([1, 30])(
    'changes description alone on a session %d days ago without other effects',
    async (daysAgo) => {
      const sessionId = await pastSession(ann, daysAgo);
      const beforeToasts = await toastsOf(sessionId);
      const [beforeSession] = await db
        .select()
        .from(toastSession)
        .where(eq(toastSession.id, sessionId));
      const beforeQuota = await db
        .select()
        .from(rateLimit)
        .where(eq(rateLimit.key, `toast:${ann.userId}`));
      const res = await patchSession(ann, sessionId, { description: '  Breakfast  ' });
      expect(res.statusCode).toBe(200);
      expect(res.json<ToastSessionChangeResponse>()).toMatchObject({
        session: { id: sessionId, count: 1, description: 'Breakfast', editable: false },
        newAchievements: [],
      });
      expect(await toastsOf(sessionId)).toEqual(beforeToasts);
      const [afterSession] = await db
        .select()
        .from(toastSession)
        .where(eq(toastSession.id, sessionId));
      expect(afterSession).toEqual({ ...beforeSession, description: 'Breakfast' });
      expect(
        await db
          .select()
          .from(rateLimit)
          .where(eq(rateLimit.key, `toast:${ann.userId}`)),
      ).toEqual(beforeQuota);
      expect(await db.select().from(userAchievement)).toHaveLength(0);
      expect(await db.select().from(flag)).toHaveLength(0);
    },
  );

  it.each([null, ' \n\t '])('clears a past session description with %j', async (description) => {
    const sessionId = await pastSession(ann, 1);
    await db
      .update(toastSession)
      .set({ description: 'Breakfast' })
      .where(eq(toastSession.id, sessionId));
    const before = await toastsOf(sessionId);
    const res = await patchSession(ann, sessionId, { description });
    expect(res.statusCode).toBe(200);
    expect(res.json<ToastSessionChangeResponse>().session.description).toBeNull();
    const [stored] = await db.select().from(toastSession).where(eq(toastSession.id, sessionId));
    expect(stored?.description).toBeNull();
    expect(await toastsOf(sessionId)).toEqual(before);
  });

  it.each([1, 2])(
    'rejects a past-day count of %d with description atomically, even when unchanged',
    async (count) => {
      const sessionId = await pastSession(ann, 1);
      await db
        .update(toastSession)
        .set({ description: 'Breakfast' })
        .where(eq(toastSession.id, sessionId));
      const before = await toastsOf(sessionId);
      const res = await patchSession(ann, sessionId, { count, description: 'Not saved' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
      const [stored] = await db.select().from(toastSession).where(eq(toastSession.id, sessionId));
      expect(stored?.description).toBe('Breakfast');
      expect(await toastsOf(sessionId)).toEqual(before);
    },
  );

  it('changes description alone without changing toasts or awarding achievements', async () => {
    const sessionId = await photolessSession(ann);
    const before = await toastsOf(sessionId);
    const res = await patchSession(ann, sessionId, { description: '  Breakfast  ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<ToastSessionChangeResponse>()).toMatchObject({
      session: { id: sessionId, count: 1, description: 'Breakfast' },
      newAchievements: [],
    });
    expect(await toastsOf(sessionId)).toEqual(before);
    expect(await db.select().from(userAchievement)).toHaveLength(0);
  });

  it('changes count and description together, preserving a description when omitted later', async () => {
    const { session } = await logSession(ann);
    const changed = await patchSession(ann, session.id, { count: 3, description: '  Breakfast  ' });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<ToastSessionChangeResponse>().session).toMatchObject({
      count: 3,
      description: 'Breakfast',
    });
    const countOnly = await patchCount(ann, session.id, 2);
    expect(countOnly.statusCode).toBe(200);
    expect(countOnly.json<ToastSessionChangeResponse>().session).toMatchObject({
      count: 2,
      description: 'Breakfast',
    });
  });

  it.each([null, ' \n\t '])('clears the description with %j', async (description) => {
    const { session } = await logSession(ann, { description: 'Breakfast' });
    const res = await patchSession(ann, session.id, { description });
    expect(res.statusCode).toBe(200);
    expect(res.json<ToastSessionChangeResponse>().session).toMatchObject({
      count: 1,
      description: null,
    });
    expect((await listSessions(ann)).items[0]?.description).toBeNull();
    const [stored] = await db.select().from(toastSession).where(eq(toastSession.id, session.id));
    expect(stored?.description).toBeNull();
  });

  it('rejects no-op payloads and invalid descriptions', async () => {
    const { session } = await logSession(ann, { description: 'Breakfast' });
    for (const payload of [
      {},
      { other: true },
      { description: 123 },
      { description: 'a'.repeat(501) },
    ]) {
      expect((await patchSession(ann, session.id, payload)).statusCode).toBe(400);
    }
    expect((await listSessions(ann)).items[0]?.description).toBe('Breakfast');
  });

  it('keeps the session, ownership and moderation restrictions for description-only edits', async () => {
    const payload = { description: 'Breakfast' };
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/toast-sessions/${UNKNOWN_ID}`,
          payload,
        })
      ).statusCode,
    ).toBe(401);
    expect((await patchSession(ann, UNKNOWN_ID, payload)).statusCode).toBe(404);
    expect((await patchSession(ann, 'not-a-uuid', payload)).statusCode).toBe(400);
    const yesterday = await pastSession(ann, 1);
    const { session } = await logSession(ann);
    const bob = await signIn(app, 'bob@example.com');
    expect((await patchSession(bob, session.id, payload)).statusCode).toBe(403);
    expect((await patchSession(bob, yesterday, payload)).statusCode).toBe(403);
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.sessionId, session.id));
    await db.update(toast).set({ status: 'rejected' }).where(eq(toast.sessionId, yesterday));
    expect((await patchSession(ann, session.id, payload)).statusCode).toBe(409);
    expect((await patchSession(ann, yesterday, payload)).statusCode).toBe(409);
    await db
      .update(toastSession)
      .set({ deletedAt: new Date() })
      .where(eq(toastSession.id, session.id));
    expect((await patchSession(ann, session.id, payload)).statusCode).toBe(404);
    const stored = await db.select().from(toastSession);
    expect(stored.every((row) => row.description === null)).toBe(true);
  });

  it('takes no quota for description-only edits and rolls them back if a combined count change fails', async () => {
    const { session } = await logSession(ann, { count: 8, description: 'Breakfast' });
    await logSession(ann, { count: 10 });
    await logSession(ann, { count: 10 });
    const descriptionOnly = await patchSession(ann, session.id, { description: 'Coffee' });
    expect(descriptionOnly.statusCode).toBe(200);
    expect(descriptionOnly.json<ToastSessionChangeResponse>().newAchievements).toEqual([]);
    expect((await patchCount(ann, session.id, 10)).statusCode).toBe(200);
    expect((await patchCount(ann, session.id, 9)).statusCode).toBe(200);
    const failed = await patchSession(ann, session.id, { count: 10, description: 'Not saved' });
    expect(failed.statusCode).toBe(429);
    expect((await listSessions(ann)).items.find((row) => row.id === session.id)).toMatchObject({
      count: 9,
      description: 'Coffee',
    });
    expect((await patchSession(ann, session.id, { description: null })).statusCode).toBe(200);
  });

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
  it('adds a photo to a session from before photos were required', async () => {
    const sessionId = await photolessSession(ann);
    const res = await putPhoto(ann, sessionId, multipart({}, { data: await photo() }));
    expect(res.statusCode).toBe(200);
    const body = res.json<ToastSessionChangeResponse>();
    expect(body.session).toMatchObject({ count: 1, hasPhoto: true });
    expect(body.session.photoUrl).toMatch(/X-Amz-Expires=3600/);

    const [lead] = await toastsOf(sessionId);
    expect(lead?.photoKey).toMatch(/\.webp$/);
    expect(await db.select().from(discardedPhoto)).toHaveLength(0);
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
    const [before] = await toastsOf(session.id);
    const missing = await putPhoto(ann, session.id);
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: { fields: { photo: 'Required' } } });

    const bad = await putPhoto(
      ann,
      session.id,
      multipart({}, { data: Buffer.from('not an image') }),
    );
    expect(bad.statusCode).toBe(400);
    expect((await toastsOf(session.id))[0]?.photoKey).toBe(before?.photoKey);
  });
});

describe('DELETE /toast-sessions/:id/photo', () => {
  it('is gone: a photo can only be replaced, also a hidden one stays (SPEC §12 D64)', async () => {
    const { session } = await logSession(ann);
    await db
      .update(toast)
      .set({ photoHiddenAt: new Date() })
      .where(eq(toast.sessionId, session.id));
    const [before] = await toastsOf(session.id);

    expect((await deletePhoto(ann, session.id)).statusCode).toBe(404);
    const [after] = await toastsOf(session.id);
    expect(after?.photoKey).toBe(before?.photoKey);
    expect(after?.photoHiddenAt).toBeInstanceOf(Date);
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
