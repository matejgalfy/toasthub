import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { addDays, type HomeResponse, localDate, TIME_ZONE } from '@toasthub/shared';
import { eq } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signIn } from '../../test/auth';
import { createTestApp } from '../../test/create-app';
import { insertToasts } from '../../test/toasts';
import { type Database, DB } from '../db/db.module';
import { toastOfTheWeek, verification } from '../db/schema';
import { previousWeekStart } from '../modules/totw/totw-draw';
import { JOB_SCHEDULES, JobName } from './job-names';
import { WorkerModule } from './worker.module';

let worker: TestingModule;
let boss: PgBoss;
let db: Database;

beforeEach(async () => {
  worker = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
  // Runs the bootstrap hooks: pg-boss starts, the queues, handlers and schedules are registered.
  await worker.init();
  boss = worker.get(PgBoss);
  db = worker.get<Database>(DB);
});

afterEach(async () => {
  await worker.close();
});

// The worker polls every 2 s and `eventually` waits up to 15 s: more than the default 5 s per test.
const JOB_TEST_TIMEOUT = 30_000;

/** Polls until `check` returns a value, as the worker picks jobs up on its polling interval. */
async function eventually<T>(check: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error('Timed out waiting for the job');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe('worker jobs', () => {
  it('schedules every job in Europe/Bratislava time', async () => {
    const schedules = await boss.getSchedules();
    expect(
      schedules
        .map(({ name, cron, timezone }) => ({ name, cron, timezone }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(
      Object.values(JobName)
        .map((name) => ({ name, cron: JOB_SCHEDULES[name], timezone: TIME_ZONE }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(JOB_SCHEDULES[JobName.totwDraw]).toBe('0 0 * * 1');
  });

  it(
    'fills the home card when the draw job runs',
    async () => {
      const app: NestFastifyApplication = await createTestApp();
      try {
        const ann = await signIn(app, 'ann@example.com');
        const lastWeek = previousWeekStart(localDate(new Date()));
        const [winner] = await insertToasts(db, [
          {
            userId: ann.userId,
            eatenAt: new Date(`${addDays(lastWeek, 3)}T10:00:00Z`),
            photoKey: 'toasts/jobs-test/winner.webp',
          },
        ]);

        await boss.send(JobName.totwDraw);
        const drawn = await eventually(async () => {
          const [row] = await db
            .select()
            .from(toastOfTheWeek)
            .where(eq(toastOfTheWeek.weekStart, lastWeek));
          return row;
        });
        expect(drawn.toastId).toBe(winner?.id);

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/home',
          headers: { cookie: ann.cookie },
        });
        expect(res.json<HomeResponse>().toastOfTheWeek).toMatchObject({
          weekStart: lastWeek,
          status: 'won',
          toast: { id: winner?.id },
        });
      } finally {
        await app.close();
      }
    },
    JOB_TEST_TIMEOUT,
  );

  it(
    'cleans up expired magic-link tokens',
    async () => {
      await db
        .insert(verification)
        .values({ identifier: 'old', value: 'x', expiresAt: new Date(Date.now() - 60_000) });
      await boss.send(JobName.cleanupVerifications);
      await eventually(async () => {
        const left = await db.select().from(verification);
        return left.length === 0 ? true : undefined;
      });
    },
    JOB_TEST_TIMEOUT,
  );
});
