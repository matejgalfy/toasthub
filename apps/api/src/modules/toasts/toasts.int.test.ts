import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type CreateToastResponse, localDate, PHOTO_MAX_BYTES } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn, WEB_ORIGIN } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { type Database, DB } from '../../db/db.module';
import { clan, clanMembership, flag, like, toast } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import { TOAST_RATE_LIMIT } from './toasts.service';

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

/** A `multipart/form-data` body with one file part. */
function filePart(data: Buffer, field = 'photo', type = 'image/jpeg') {
  const head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="toast.jpg"\r\nContent-Type: ${type}\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

function postToast(as: SignedIn, body?: ReturnType<typeof filePart>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/toasts',
    headers: { cookie: as.cookie, origin: WEB_ORIGIN, ...body?.headers },
    payload: body?.payload,
  });
}

function deleteToast(as: SignedIn, id: string) {
  return app.inject({
    method: 'DELETE',
    url: `/api/v1/toasts/${id}`,
    headers: { cookie: as.cookie, origin: WEB_ORIGIN },
  });
}

async function createToast(as: SignedIn): Promise<CreateToastResponse['toast']> {
  const res = await postToast(as);
  expect(res.statusCode).toBe(201);
  return res.json<CreateToastResponse>().toast;
}

function photo(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#d09050' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1', GPSMapDatum: 'WGS-84' } })
    .toBuffer();
}

describe('POST /toasts', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/toasts' });
    expect(res.statusCode).toBe(401);
  });

  it('logs a toast without a photo at the server time', async () => {
    const before = Date.now();
    const res = await postToast(ann);
    expect(res.statusCode).toBe(201);

    const body = res.json<CreateToastResponse>();
    expect(body).toEqual({
      toast: {
        id: expect.any(String) as string,
        userId: ann.userId,
        clanId: null,
        eatenAt: expect.any(String) as string,
        localDate: localDate(new Date()),
        photoUrl: null,
      },
      newAchievements: [],
    });
    const eatenAt = Date.parse(body.toast.eatenAt);
    expect(eatenAt).toBeGreaterThanOrEqual(before - 1000);
    expect(eatenAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('counts the toast for the current clan', async () => {
    const [breakfast] = await db.insert(clan).values({ name: 'Breakfast Club' }).returning();
    if (!breakfast) throw new Error('No clan');
    await db
      .insert(clanMembership)
      .values({ userId: ann.userId, clanId: breakfast.id, role: 'owner' });

    expect((await createToast(ann)).clanId).toBe(breakfast.id);
  });

  it('stores a photo as WebP without EXIF and returns a presigned URL', async () => {
    const res = await postToast(ann, filePart(await photo(2400, 1800)));
    expect(res.statusCode).toBe(201);
    const { toast: created } = res.json<CreateToastResponse>();
    expect(created.photoUrl).toMatch(/X-Amz-Expires=3600/);

    const [row] = await db.select().from(toast).where(eq(toast.id, created.id));
    expect(row?.photoKey).toMatch(new RegExp(`^toasts/${ann.userId}/[0-9a-f-]{36}\\.webp$`));

    const download = await fetch(created.photoUrl ?? '');
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/webp');
    const metadata = await sharp(Buffer.from(await download.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 1600, height: 1200 });
    expect(metadata.exif).toBeUndefined();
  });

  it('accepts a multipart body without a file', async () => {
    const res = await postToast(ann, {
      payload: Buffer.from(`--${BOUNDARY}--\r\n`),
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<CreateToastResponse>().toast.photoUrl).toBeNull();
  });

  it('rejects a file that is not a supported image, whatever its name and type say', async () => {
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    const res = await postToast(ann, filePart(gif));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fields: { photo: expect.any(String) as string } },
    });
    expect(await db.select().from(toast)).toHaveLength(0);
  });

  it('rejects a photo over 10 MB', async () => {
    const huge = Buffer.concat([await photo(8, 8), Buffer.alloc(PHOTO_MAX_BYTES)]);
    const res = await postToast(ann, filePart(huge));
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(await db.select().from(toast)).toHaveLength(0);
  });

  it('rejects a file under another field name', async () => {
    const res = await postToast(ann, filePart(await photo(8, 8), 'picture'));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { fields: { picture: expect.any(String) as string } },
    });
  });

  it(`allows ${String(TOAST_RATE_LIMIT)} toasts per hour`, async () => {
    for (let i = 0; i < TOAST_RATE_LIMIT; i++) await createToast(ann);
    const res = await postToast(ann);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });

    const bob = await signIn(app, 'bob@example.com');
    expect((await postToast(bob)).statusCode).toBe(201);
  });
});

describe('count threshold flag', () => {
  async function countFlags() {
    return db.select().from(flag).where(eq(flag.subjectUserId, ann.userId));
  }

  it('is opened once when the day goes over the threshold', async () => {
    await app.get(SettingsService).set({ flagDailyThreshold: 2 });

    await createToast(ann);
    await createToast(ann);
    expect(await countFlags()).toHaveLength(0);

    await createToast(ann);
    await createToast(ann);
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
    expect(rows.map((row) => row.status)).toEqual(['active', 'active', 'active', 'active']);
  });

  it('ignores deleted toasts', async () => {
    await app.get(SettingsService).set({ flagDailyThreshold: 1 });

    const first = await createToast(ann);
    expect((await deleteToast(ann, first.id)).statusCode).toBe(204);
    await createToast(ann);
    expect(await countFlags()).toHaveLength(0);

    await createToast(ann);
    expect(await countFlags()).toHaveLength(1);
  });
});

describe('DELETE /toasts/:id', () => {
  it('soft-deletes the own toast and removes its likes', async () => {
    const bob = await signIn(app, 'bob@example.com');
    const created = await createToast(ann);
    await db.insert(like).values({ toastId: created.id, userId: bob.userId });

    const res = await deleteToast(ann, created.id);
    expect(res.statusCode).toBe(204);

    const [row] = await db.select().from(toast).where(eq(toast.id, created.id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(like).where(eq(like.toastId, created.id))).toHaveLength(0);

    expect((await deleteToast(ann, created.id)).statusCode).toBe(404);
  });

  it("refuses someone else's toast", async () => {
    const bob = await signIn(app, 'bob@example.com');
    const created = await createToast(ann);

    const res = await deleteToast(bob, created.id);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const [row] = await db.select().from(toast).where(eq(toast.id, created.id));
    expect(row?.deletedAt).toBeNull();
  });

  it('returns 404 for an unknown toast and 400 for a malformed id', async () => {
    expect((await deleteToast(ann, '01890a5d-ac96-774b-bcce-b302099a8057')).statusCode).toBe(404);
    expect((await deleteToast(ann, 'not-a-uuid')).statusCode).toBe(400);
  });
});
