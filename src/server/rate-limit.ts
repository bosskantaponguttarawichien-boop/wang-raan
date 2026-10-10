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

/** IP ของผู้ส่ง — อ่านจาก Proxy header (Vercel/Nginx ตั้งให้); ถ้าไม่มีใช้ "unknown" ร่วมกัน */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
