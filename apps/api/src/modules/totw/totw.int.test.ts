import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  addDays,
  type HomeResponse,
  type LocalDate,
  localDate,
  type ToastOfTheWeekPage,
} from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type SignedIn, signIn } from '../../../test/auth';
import { createTestApp } from '../../../test/create-app';
import { insertToasts } from '../../../test/toasts';
import { type Database, DB } from '../../db/db.module';
import { toast, toastOfTheWeek, user, userAchievement } from '../../db/schema';
import { AchievementsService } from '../achievements/achievements.service';
import { StorageService } from '../storage/storage.service';
import { previousWeekStart, type RandomIndex } from './totw-draw';
import { TotwService } from './totw.service';

let app: NestFastifyApplication;
let db: Database;
let ann: SignedIn;
let bob: SignedIn;
let lastWeek: LocalDate;

beforeEach(async () => {
  app = await createTestApp();
  db = app.get<Database>(DB);
  ann = await signIn(app, 'ann@example.com');
  bob = await signIn(app, 'bob@example.com');
  await db.update(user).set({ displayName: 'Ann' }).where(eq(user.id, ann.userId));
  await db.update(user).set({ displayName: 'Bob' }).where(eq(user.id, bob.userId));
  lastWeek = previousWeekStart(localDate(new Date()));
});

afterEach(async () => {
  await app.close();
});

/** The service with a random source the test controls; it records how many candidates it was asked for. */
function totwWith(pick: (n: number) => number = () => 0) {
  const asked: number[] = [];
  const randomIndex: RandomIndex = (n) => {
    asked.push(n);
    return pick(n);
  };
  const service = new TotwService(
    db,
    randomIndex,
    app.get(AchievementsService, { strict: false }),
    app.get(StorageService, { strict: false }),
  );
  return { service, asked };
}

/** Midday in Bratislava on `day` days after `weekStart` (0 = Monday … 6 = Sunday). */
function on(weekStart: LocalDate, day: number): Date {
  return new Date(`${addDays(weekStart, day)}T10:00:00Z`);
}

let photoCount = 0;
function photo(): string {
  photoCount++;
  return `toasts/test/${String(photoCount)}.webp`;
}

async function photoToast(
  userId: string,
  eatenAt: Date,
  extra: Partial<typeof toast.$inferInsert> = {},
) {
  const [row] = await insertToasts(db, [{ userId, eatenAt, photoKey: photo(), ...extra }]);
  if (!row) throw new Error('No toast');
  return row;
}

async function getHistory(as: SignedIn, query = ''): Promise<ToastOfTheWeekPage> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/toast-of-the-week${query}`,
    headers: { cookie: as.cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json<ToastOfTheWeekPage>();
}

describe('TotwService.draw', () => {
  it('records a week without a winner when nothing is eligible', async () => {
    const { service, asked } = totwWith();
    // No photo, a photo from the week before and one from this week.
    await insertToasts(db, [{ userId: ann.userId, eatenAt: on(lastWeek, 2) }]);
    await photoToast(ann.userId, on(lastWeek, -1));
    await photoToast(ann.userId, on(lastWeek, 7));

    expect(await service.draw(lastWeek)).toEqual({ weekStart: lastWeek, toastId: null });
    expect(asked).toEqual([]);
    const [row] = await db.select().from(toastOfTheWeek);
    expect(row).toMatchObject({ weekStart: lastWeek, toastId: null, drawnBy: null });
  });

  it('only draws visible photos of countable toasts from that week', async () => {
    const { service, asked } = totwWith();
    const eligible = await photoToast(ann.userId, on(lastWeek, 6));
    await photoToast(ann.userId, on(lastWeek, 1), { photoHiddenAt: new Date() });
    await photoToast(ann.userId, on(lastWeek, 2), { deletedAt: new Date() });
    await photoToast(ann.userId, on(lastWeek, 3), { status: 'rejected' });
    const cyril = await signIn(app, 'cyril@example.com');
    await photoToast(cyril.userId, on(lastWeek, 4));
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, cyril.userId));

    expect(await service.draw(lastWeek)).toEqual({ weekStart: lastWeek, toastId: eligible.id });
    expect(asked).toEqual([1]);
  });

  it('enters every user, whatever their profile visibility', async () => {
    const { service, asked } = totwWith();
    await db.update(user).set({ profileVisibility: 'clan' }).where(eq(user.id, bob.userId));
    const hidden = await photoToast(bob.userId, on(lastWeek, 0));
    expect((await service.draw(lastWeek)).toastId).toBe(hidden.id);
    expect(asked).toEqual([1]);
  });

  it('picks the candidate at the random index, in id order', async () => {
    const toasts = [
      await photoToast(ann.userId, on(lastWeek, 0)),
      await photoToast(bob.userId, on(lastWeek, 3)),
      await photoToast(ann.userId, on(lastWeek, 5)),
    ];
    const byId = toasts.map((t) => t.id).sort();
    for (const [index, expected] of byId.entries()) {
      const { service, asked } = totwWith(() => index);
      const result = await service.draw(lastWeek, { replace: true });
      expect(result.toastId).toBe(expected);
      expect(asked).toEqual([3]);
    }
  });

  it('awards golden_toast to the winner', async () => {
    await photoToast(bob.userId, on(lastWeek, 0));
    await totwWith().service.draw(lastWeek);
    const earned = await db.select().from(userAchievement);
    expect(earned).toEqual([
      expect.objectContaining({ userId: bob.userId, achievementCode: 'golden_toast' }),
    ]);
  });

  it('keeps a drawn week unless it is replaced', async () => {
    const first = await photoToast(ann.userId, on(lastWeek, 0));
    const second = await photoToast(bob.userId, on(lastWeek, 1));
    const [lower, higher] = [first.id, second.id].sort();

    await totwWith(() => 0).service.draw(lastWeek);
    // A retried job: the winner stays and the source isn't asked again.
    const retry = totwWith(() => 1);
    expect((await retry.service.draw(lastWeek)).toastId).toBe(lower);
    expect(retry.asked).toEqual([]);

    // The admin's redraw.
    const redraw = await totwWith(() => 1).service.draw(lastWeek, {
      replace: true,
      drawnBy: ann.userId,
    });
    expect(redraw.toastId).toBe(higher);
    const [row] = await db.select().from(toastOfTheWeek);
    expect(row).toMatchObject({ toastId: higher, drawnBy: ann.userId });
  });

  it('draws the previous week on schedule', async () => {
    const winner = await photoToast(ann.userId, on(lastWeek, 4));
    expect(await totwWith().service.drawPreviousWeek()).toEqual({
      weekStart: lastWeek,
      toastId: winner.id,
    });
  });

  it('refuses a day that is not a Monday and a week that has not ended', async () => {
    const { service } = totwWith();
    await expect(service.draw(addDays(lastWeek, 1))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.draw(addDays(lastWeek, 7))).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('GET /toast-of-the-week', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/toast-of-the-week' });
    expect(res.statusCode).toBe(401);
  });

  it('is empty before the first draw', async () => {
    expect(await getHistory(ann)).toEqual({ items: [], nextCursor: null });
  });

  it('lists drawn weeks newest first, with the winner, none or removed', async () => {
    const weeks = [0, 1, 2, 3].map((n) => addDays(lastWeek, -7 * n));
    const [week0, week1, week2, week3] = weeks as [LocalDate, LocalDate, LocalDate, LocalDate];
    // A clan-only profile: the winning photo is still shown to everyone (BR-TOTW-2).
    await db.update(user).set({ profileVisibility: 'clan' }).where(eq(user.id, bob.userId));
    const winner = await photoToast(bob.userId, on(week0, 2));
    const deleted = await photoToast(ann.userId, on(week2, 2));
    const hidden = await photoToast(bob.userId, on(week3, 2));
    const { service } = totwWith();
    for (const week of weeks) await service.draw(week);
    await db.update(toast).set({ deletedAt: new Date() }).where(eq(toast.id, deleted.id));
    await db.update(toast).set({ photoHiddenAt: new Date() }).where(eq(toast.id, hidden.id));

    const history = await getHistory(ann);
    expect(history).toEqual({
      items: [
        {
          weekStart: week0,
          status: 'won',
          toast: {
            id: winner.id,
            user: { id: bob.userId, displayName: 'Bob', avatarId: null },
            eatenAt: winner.eatenAt.toISOString(),
            photoUrl: expect.stringContaining(winner.photoKey ?? '-') as string,
          },
        },
        { weekStart: week1, status: 'none', toast: null },
        { weekStart: week2, status: 'removed', toast: null },
        { weekStart: week3, status: 'removed', toast: null },
      ],
      nextCursor: null,
    });
  });

  it('shows a winner who was banned since as removed', async () => {
    await photoToast(bob.userId, on(lastWeek, 0));
    await totwWith().service.draw(lastWeek);
    await db.update(user).set({ status: 'banned' }).where(eq(user.id, bob.userId));
    expect((await getHistory(ann)).items).toEqual([
      { weekStart: lastWeek, status: 'removed', toast: null },
    ]);
  });

  it('pages with a cursor', async () => {
    const { service } = totwWith();
    const weeks = [0, 1, 2].map((n) => addDays(lastWeek, -7 * n));
    for (const week of weeks) await service.draw(week);

    const first = await getHistory(ann, '?limit=2');
    expect(first.items.map((item) => item.weekStart)).toEqual(weeks.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    const second = await getHistory(ann, `?limit=2&cursor=${first.nextCursor ?? ''}`);
    expect(second).toEqual({
      items: [{ weekStart: weeks[2], status: 'none', toast: null }],
      nextCursor: null,
    });
  });

  it('rejects a bad cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/toast-of-the-week?cursor=nope',
      headers: { cookie: ann.cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /home toastOfTheWeek', () => {
  async function home(): Promise<HomeResponse> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/home',
      headers: { cookie: ann.cookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json<HomeResponse>();
  }

  it("shows last week's draw once it has run", async () => {
    expect((await home()).toastOfTheWeek).toBeNull();
    const winner = await photoToast(bob.userId, on(lastWeek, 6));
    // An older week isn't last week's.
    await totwWith().service.draw(addDays(lastWeek, -7));
    expect((await home()).toastOfTheWeek).toBeNull();

    await totwWith().service.draw(lastWeek);
    expect((await home()).toastOfTheWeek).toMatchObject({
      weekStart: lastWeek,
      status: 'won',
      toast: { id: winner.id, user: { id: bob.userId, displayName: 'Bob' } },
    });
  });
});
