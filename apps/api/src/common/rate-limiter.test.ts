import { describe, expect, it } from 'vitest';

import { RateLimiter } from './rate-limiter';

const MINUTE = 60_000;

describe('RateLimiter', () => {
  it('allows up to the limit within the window', () => {
    const limiter = new RateLimiter(3, MINUTE);
    expect([0, 1, 2, 3].map((at) => limiter.tryHit('ann', at))).toEqual([true, true, true, false]);
  });

  it('counts keys separately', () => {
    const limiter = new RateLimiter(1, MINUTE);
    expect(limiter.tryHit('ann', 0)).toBe(true);
    expect(limiter.tryHit('bob', 0)).toBe(true);
    expect(limiter.tryHit('ann', 1)).toBe(false);
  });

  it('frees a slot once the oldest hit leaves the window', () => {
    const limiter = new RateLimiter(2, MINUTE);
    limiter.tryHit('ann', 0);
    limiter.tryHit('ann', 30_000);
    expect(limiter.tryHit('ann', MINUTE - 1)).toBe(false);
    expect(limiter.tryHit('ann', MINUTE)).toBe(true);
    expect(limiter.tryHit('ann', MINUTE + 1)).toBe(false);
  });

  it('does not record rejected hits', () => {
    const limiter = new RateLimiter(1, MINUTE);
    limiter.tryHit('ann', 0);
    // Retrying while limited must not push the window further out.
    expect(limiter.tryHit('ann', 50_000)).toBe(false);
    expect(limiter.tryHit('ann', MINUTE)).toBe(true);
  });

  it('takes several hits at once or none of them', () => {
    const limiter = new RateLimiter(5, MINUTE);
    expect(limiter.tryHit('ann', 0, 3)).toBe(true);
    expect(limiter.tryHit('ann', 1, 3)).toBe(false);
    expect(limiter.tryHit('ann', 2, 2)).toBe(true);
    expect(limiter.tryHit('ann', 3)).toBe(false);
    expect(limiter.tryHit('ann', MINUTE, 3)).toBe(true);
  });

  it('keeps working after idle keys are swept', () => {
    const limiter = new RateLimiter(1, MINUTE);
    limiter.tryHit('ann', 0);
    limiter.tryHit('bob', 10 * MINUTE);
    expect(limiter.tryHit('ann', 10 * MINUTE)).toBe(true);
    expect(limiter.tryHit('bob', 10 * MINUTE + 1)).toBe(false);
  });
});
