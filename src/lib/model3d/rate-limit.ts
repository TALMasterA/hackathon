export interface RateLimitOptions {
  perIp: number;
  windowMs: number;
  daily: number;
  dayMs: number;
}

export const MODEL3D_RATE_LIMITS: RateLimitOptions = { perIp: 5, windowMs: 10 * 60 * 1000, daily: 60, dayMs: 24 * 60 * 60 * 1000 };

/**
 * In-memory sliding windows for one server instance: a per-IP limit plus a global daily cap.
 * Only accepted submissions are recorded, so rejected uploads do not use up anyone's quota.
 */
export class RateLimiter {
  private readonly perIp = new Map<string, number[]>();
  private global: number[] = [];

  constructor(private readonly options: RateLimitOptions = MODEL3D_RATE_LIMITS, private readonly now: () => number = Date.now) {}

  /** The limit an extra submission from this IP would exceed, or null when it is allowed. */
  check(ip: string): "ip" | "daily" | null {
    const time = this.now();
    this.global = this.global.filter((stamp) => time - stamp < this.options.dayMs);
    if (this.global.length >= this.options.daily) return "daily";
    return this.recent(ip, time).length >= this.options.perIp ? "ip" : null;
  }

  record(ip: string): void {
    const time = this.now();
    this.perIp.set(ip, [...this.recent(ip, time), time]);
    this.global.push(time);
  }

  private recent(ip: string, time: number): number[] {
    const stamps = (this.perIp.get(ip) ?? []).filter((stamp) => time - stamp < this.options.windowMs);
    if (stamps.length === 0) this.perIp.delete(ip);
    else this.perIp.set(ip, stamps);
    if (this.perIp.size > 1000) for (const [key, value] of this.perIp) if (value.every((stamp) => time - stamp >= this.options.windowMs)) this.perIp.delete(key);
    return stamps;
  }
}

/** First X-Forwarded-For hop, then X-Real-IP; spoofable without a trusted proxy, which the daily cap bounds. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
