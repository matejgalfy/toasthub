import { type BrowserContext, expect, type Page, test } from '@playwright/test';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

import { magicLinkFor } from '../support/mailpit.js';

// SPEC §10: p95 API < 300 ms; LCP < 2.5 s on a 4G mid-range phone.
const P95_BUDGET_MS = 300;
const LCP_BUDGET_MS = 2500;
const REQUESTS = 300;
const CONCURRENCY = 10;
// A seeded user (`db:seed`) with toasts, a clan and a streak. One sign-in per run: the magic-link limit is
// 5 an hour per email, so set PERF_EMAIL to another seeded user (bob@, cyril@, …) for a sixth run.
const EMAIL = process.env.PERF_EMAIL ?? 'ann@example.com';

const mbit = (n: number) => (n * 1024 * 1024) / 8;
/**
 * Both on a mid-range phone (4× CPU slowdown). The budget applies to "4G" (WebPageTest's profile: 9 Mbit/s,
 * 170 ms RTT). "slow 4G" is Lighthouse's mobile default (1.6 Mbit/s, 150 ms), closer to 3G; it is shown
 * to watch the trend, not enforced.
 */
const PROFILES = {
  '4G': { latency: 170, downloadThroughput: mbit(9), uploadThroughput: mbit(9), enforced: true },
  'slow 4G': {
    latency: 150,
    downloadThroughput: mbit(1.6),
    uploadThroughput: mbit(0.75),
    enforced: false,
  },
};
type Profile = (typeof PROFILES)[keyof typeof PROFILES];
const CPU_SLOWDOWN = 4;

interface Me {
  id: string;
  clanId: string | null;
}

async function signIn(page: Page): Promise<Me> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Send login link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.goto(await magicLinkFor(EMAIL, { count: 1 }));
  await expect(page).toHaveURL(/\/home$/);
  const response = await page.request.get('/api/v1/me');
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { user: Me }).user;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

/** `REQUESTS` GETs at `CONCURRENCY` in flight; fails on any non-2xx. Times in ms. */
async function load(url: string, cookie: string) {
  const get = async () => {
    const start = performance.now();
    const response = await fetch(url, { headers: { cookie } });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`${url}: HTTP ${String(response.status)}`);
    return performance.now() - start;
  };
  for (let i = 0; i < CONCURRENCY; i++) await get(); // warm up connections and caches

  const times: number[] = [];
  let next = 0;
  const worker = async () => {
    while (next < REQUESTS) {
      next++;
      times.push(await get());
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 50), p95: percentile(times, 95), max: times.at(-1) ?? 0 };
}

let me: Me;
let session: StorageState;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext(test.info().project.use);
  me = await signIn(await context.newPage());
  session = await context.storageState();
  await context.close();
});

test('API p95 stays under 300 ms under load', async ({ baseURL }) => {
  const cookie = session.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

  const paths = [
    '/api/v1/me',
    '/api/v1/home',
    '/api/v1/me/toast-sessions',
    '/api/v1/leaderboards/users?period=week',
    '/api/v1/leaderboards/users?period=year',
    '/api/v1/leaderboards/clans?period=month',
    `/api/v1/users/${me.id}`,
    `/api/v1/users/${me.id}/stats`,
    `/api/v1/users/${me.id}/heatmap`,
    `/api/v1/users/${me.id}/achievements`,
    '/api/v1/clans',
    ...(me.clanId
      ? [
          `/api/v1/clans/${me.clanId}`,
          `/api/v1/clans/${me.clanId}/feed`,
          `/api/v1/clans/${me.clanId}/leaderboard?period=year`,
        ]
      : []),
  ];

  const rows: Record<string, { p50: number; p95: number; max: number }> = {};
  for (const path of paths) {
    const result = await load(new URL(path, baseURL).toString(), cookie);
    rows[path.replace(me.id, ':me').replace(me.clanId ?? ':none', ':clan')] = {
      p50: Math.round(result.p50),
      p95: Math.round(result.p95),
      max: Math.round(result.max),
    };
  }
  console.table(rows);
  for (const [path, { p95 }] of Object.entries(rows)) {
    expect.soft(p95, `p95 of ${path}`).toBeLessThan(P95_BUDGET_MS);
  }
});

async function measureLcp(
  context: BrowserContext,
  path: string,
  profile: Profile,
): Promise<number> {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latency,
    downloadThroughput: profile.downloadThroughput,
    uploadThroughput: profile.uploadThroughput,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          resolve(list.getEntries().at(-1)?.startTime ?? 0);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => {
          resolve(0);
        }, 5000);
      }),
  );
  await page.close();
  return lcp;
}

test('LCP stays under 2.5 s on 4G on a mid-range phone, with a cold cache', async ({ browser }) => {
  const rows: Record<string, Record<string, number>> = {};
  for (const [path, signedIn] of [
    ['/', false],
    ['/login', false],
    ['/home', true],
    ['/leaderboards', true],
  ] as const) {
    rows[path] = {};
    for (const [name, profile] of Object.entries(PROFILES)) {
      // A new context per page: nothing cached, no service worker yet.
      const context = await browser.newContext({
        ...test.info().project.use,
        storageState: signedIn ? session : undefined,
      });
      const lcp = Math.round(await measureLcp(context, path, profile));
      await context.close();
      rows[path][name] = lcp;
      expect.soft(lcp, `LCP of ${path} (${name})`).toBeGreaterThan(0);
      if (profile.enforced)
        expect.soft(lcp, `LCP of ${path} (${name})`).toBeLessThan(LCP_BUDGET_MS);
    }
  }
  console.table(rows);
});
