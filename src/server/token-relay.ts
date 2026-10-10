import "server-only";
/**
 * Auth Token Relay (architecture.md §4.1, feat-031)
 * BFF ออก internal token อายุสั้น (JWT HS256) แทนการส่ง Session Cookie ของผู้ใช้ต่อไปยัง Backend
 * แล้วแนบเป็น `Authorization: Bearer <token>` — Backend ตรวจด้วย secret เดียวกัน (INTERNAL_TOKEN_SECRET)
 */

export interface InternalTokenClaims {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
}

export const INTERNAL_TOKEN_ISSUER = "wang-raan-bff";
export const INTERNAL_TOKEN_AUDIENCE = "wang-raan-backend";
export const INTERNAL_TOKEN_TTL_SECONDS = 300;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? encoder.encode(bytes) : bytes;
  let binary = "";
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createInternalToken(
  subject: string,
  secret: string,
  options: { now?: Date; ttlSeconds?: number } = {},
): Promise<string> {
  const iat = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const claims: InternalTokenClaims = {
    sub: subject,
    aud: INTERNAL_TOKEN_AUDIENCE,
    iss: INTERNAL_TOKEN_ISSUER,
    iat,
    exp: iat + (options.ttlSeconds ?? INTERNAL_TOKEN_TTL_SECONDS),
  };
  const body = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return `${body}.${base64url(signature)}`;
}

/** ตรวจ token (ใช้ในเทสต์และเป็นตัวอย่างฝั่ง Backend) — คืน claims หรือ null */
export async function verifyInternalToken(token: string, secret: string, now = new Date()): Promise<InternalTokenClaims | null> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    fromBase64url(signature) as Uint8Array<ArrayBuffer>,
    encoder.encode(`${header}.${payload}`),
  );
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as InternalTokenClaims;
    const t = Math.floor(now.getTime() / 1000);
    if (claims.aud !== INTERNAL_TOKEN_AUDIENCE || claims.iss !== INTERNAL_TOKEN_ISSUER || claims.exp <= t) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface BackendClientOptions {
  baseUrl: string;
  secret: string;
  fetch?: typeof fetch;
  now?: () => Date;
  /** หมดเวลารอ Backend ต่อครั้ง (ค่าเริ่มต้น 8 วินาที) */
  timeoutMs?: number;
  /** หน่วงก่อนลองซ้ำ (เทสต์ตั้งเป็น 0) */
  retryDelayMs?: number;
}

/** `sub` ของคำขอที่ไม่มีผู้ใช้ล็อกอิน (contracts/openapi.yaml — ใช้ได้เฉพาะ endpoint ที่ x-allow-anonymous) */
export const ANONYMOUS_SUBJECT = "anonymous";
export const BACKEND_TIMEOUT_MS = 8000;
const RETRYABLE = new Set([502, 503, 504]);

/**
 * Fetch ไป Backend พร้อมแนบ Bearer token ของผู้ใช้ทุกครั้ง (ไม่ส่ง Cookie ของผู้ใช้ต่อ)
 * - userId = null → token `sub: anonymous`
 * - GET ลองซ้ำ 1 ครั้งเมื่อเครือข่ายล้ม หรือ Backend ตอบ 502/503/504 (คำขอที่แก้ข้อมูลไม่ลองซ้ำ กันบันทึกซ้อน)
 * - หมดเวลาไม่ลองซ้ำ: Backend ที่ช้าอยู่แล้วจะยิ่งช้า และผู้ใช้ต้องรอเป็นสองเท่า
 */
export function createBackendClient(options: BackendClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? BACKEND_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? 150;
  return {
    async request(userId: string | null, path: string, init: RequestInit = {}): Promise<Response> {
      const subject = userId ?? ANONYMOUS_SUBJECT;
      const attempt = async () => {
        const headers = new Headers(init.headers);
        headers.delete("cookie");
        headers.set("authorization", `Bearer ${await createInternalToken(subject, options.secret, { now: options.now?.() })}`);
        headers.set("x-request-id", globalThis.crypto.randomUUID());
        if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
        return doFetch(new URL(path, options.baseUrl), { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      };
      if ((init.method ?? "GET").toUpperCase() !== "GET") return attempt();
      const retry = () => new Promise<void>((r) => setTimeout(r, retryDelayMs)).then(attempt);
      let res: Response;
      try {
        res = await attempt();
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") throw error;
        return retry();
      }
      return RETRYABLE.has(res.status) ? retry() : res;
    },
  };
}

export type BackendClient = ReturnType<typeof createBackendClient>;
