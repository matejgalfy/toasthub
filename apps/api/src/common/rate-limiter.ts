/**
 * Sliding-window limit of `limit` hits per `windowMs` and key, kept in memory. Fine for one API replica;
 * several replicas need a shared store (SPEC §14 Q4).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records a hit and returns true, or returns false without recording when `key` is at the limit. */
  tryHit(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    this.sweep(now, cutoff);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > cutoff);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.hits.set(key, recent);
    return allowed;
  }

  // Forgets keys without a hit in the window, at most once per window, so idle keys don't pile up.
  private sweep(now: number, cutoff: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if ((times.at(-1) ?? 0) <= cutoff) this.hits.delete(key);
    }
  }
}
