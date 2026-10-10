import "server-only";
/**
 * Rate Limiter แบบ Fixed Window ในหน่วยความจำ (feat-032)
 * พอสำหรับ server เดียว — ถ้าขยายหลายเครื่องต้องย้ายตัวนับไปที่ Redis/KV โดยคง interface `hit()` เดิม
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** วินาทีจนกว่าจะส่งได้อีก (0 เมื่ออนุญาต) */
  retryAfter: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** จำนวน key สูงสุดที่จำไว้ กันหน่วยความจำโตไม่จำกัด */
  maxKeys?: number;
}

export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10_000 }: RateLimiterOptions) {
  const windows = new Map<string, { start: number; count: number }>();
  const sweep = (t: number) => {
    for (const [key, w] of windows) if (t - w.start >= windowMs) windows.delete(key);
  };
  return {
    hit(key: string): RateLimitResult {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        if (!w && windows.size >= maxKeys) sweep(t);
        if (!w && windows.size >= maxKeys) windows.delete(windows.keys().next().value!);
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) return { allowed: false, remaining: 0, retryAfter: Math.ceil((w.start + windowMs - t) / 1000) };
      w.count++;
      return { allowed: true, remaining: limit - w.count, retryAfter: 0 };
    },
    get size() {
      return windows.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * IP ของผู้ส่งจาก X-Forwarded-For
 * ค่าซ้ายสุดผู้ส่งเขียนเองได้ → ใช้ค่าที่ proxy ที่เราไว้ใจต่อท้ายให้แทน:
 * proxy N ชั้น (TRUSTED_PROXY_HOPS, เช่น Vercel / Nginx = 1) → ค่าลำดับที่ N นับจากขวา
 * ไม่มี proxy (0) → ค่าขวาสุด ซึ่งยังปลอมได้ จึงต้องมีเพดานรวม (global limiter) ใน handler เสมอ
 */
export function clientIp(request: Request, trustedHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)): string {
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const hops = Number.isFinite(trustedHops) && trustedHops > 0 ? Math.floor(trustedHops) : 1;
  return chain[Math.max(0, chain.length - hops)] || request.headers.get("x-real-ip")?.trim() || "unknown";
}
