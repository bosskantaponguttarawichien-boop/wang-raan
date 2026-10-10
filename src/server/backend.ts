import "server-only";
/**
 * เลือกปลายทาง Backend ของ BFF (feat-039)
 * - ตั้ง WANGRAAN_BACKEND_URL + INTERNAL_TOKEN_SECRET → Backend จริง (หรือ mock-backend/server ตอน E2E)
 * - dev / test ที่ไม่ได้ตั้ง → Backend จำลองในตัว (mock-backend/handler — ข้อมูลอยู่ในหน่วยความจำ)
 * - production ที่ไม่ได้ตั้ง → BackendConfigError ทุกคำขอ (Route Handler ตอบ 503) — ห้ามแอบเก็บข้อมูลผู้ใช้ไว้ในหน่วยความจำ
 * เลือกตอนคำขอแรก (ไม่ใช่ตอน import) เพื่อให้ `next build` ผ่านได้โดยไม่ต้องมี secret ของ runtime
 */
import { createBackendClient, type BackendClient } from "./token-relay";

/** Backend ตอบผิดปกติ — status 0 = ติดต่อไม่ได้/หมดเวลา; code มาจาก `{ error: { code } }` ของ Backend */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null = null,
    readonly detail: Record<string, unknown> = {},
    /** path ที่เรียก — ใช้ใน log เท่านั้น ไม่ส่งออกไปหาผู้ใช้ */
    readonly path: string | null = null,
  ) {
    super(`Backend ${status}${code ? ` ${code}` : ""}`);
    this.name = "BackendError";
  }
}

/** production ไม่ได้ตั้งค่า Backend */
export class BackendConfigError extends Error {
  constructor() {
    super("ต้องตั้ง WANGRAAN_BACKEND_URL และ INTERNAL_TOKEN_SECRET ใน production (ดู .env.example)");
    this.name = "BackendConfigError";
  }
}

/** secret ของ Backend จำลองในตัว (dev/test เท่านั้น) */
export const DEV_BACKEND_SECRET = "wang-raan-dev-internal-secret-do-not-use-in-production";

const globalForBackend = globalThis as unknown as { __wangRaanBackend?: Promise<BackendClient> };

async function resolveClient(): Promise<BackendClient> {
  const baseUrl = process.env.WANGRAAN_BACKEND_URL;
  const secret = process.env.INTERNAL_TOKEN_SECRET;
  if (baseUrl && secret) return createBackendClient({ baseUrl, secret });
  if (process.env.NODE_ENV === "production") {
    console.error(`[wang-raan] ${new BackendConfigError().message}`);
    throw new BackendConfigError();
  }
  const { createMockBackend } = await import("../../mock-backend/handler");
  const mock = createMockBackend({ secret: DEV_BACKEND_SECRET });
  return createBackendClient({
    baseUrl: "http://mock-backend.local",
    secret: DEV_BACKEND_SECRET,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => mock.fetch(new Request(input, init))) as typeof fetch,
  });
}

/** client ที่เลือกปลายทางตอนใช้งานครั้งแรก (เก็บบน globalThis ให้รอด hot-reload ของ dev server) */
export const backendClient: BackendClient = {
  async request(userId, path, init) {
    const client = await (globalForBackend.__wangRaanBackend ??= resolveClient().catch((error) => {
      globalForBackend.__wangRaanBackend = undefined; // ตั้ง env แล้วรีสตาร์ตไม่ได้เสมอไป — ลองเลือกใหม่ครั้งหน้า
      throw error;
    }));
    return client.request(userId, path, init);
  },
};

/**
 * ส่งคำขอและแปลงผลที่ไม่คาดไว้เป็น BackendError
 * สถานะใน `expected` คืน Response ให้ผู้เรียกจัดการเอง (เช่น 404 → null)
 */
export async function send(
  client: BackendClient,
  userId: string | null,
  path: string,
  init: RequestInit = {},
  expected: number[] = [],
): Promise<Response> {
  let res: Response;
  try {
    res = await client.request(userId, path, init);
  } catch (error) {
    if (error instanceof BackendConfigError) throw error;
    // ติดต่อไม่ได้ / หมดเวลา — เก็บสาเหตุไว้ให้ log ตอนแปลงเป็น response
    throw new BackendError(0, null, { cause: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }, path);
  }
  if (res.ok || expected.includes(res.status)) return res;
  const body = (await res.json().catch(() => null)) as { error?: Record<string, unknown> } | null;
  const error = body?.error ?? {};
  throw new BackendError(res.status, typeof error.code === "string" ? error.code : null, error, path);
}

/** อ่าน JSON ของ response สำเร็จ — Backend ตอบไม่ใช่ JSON = ผิดสัญญา */
export async function readBody<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new BackendError(502);
  }
}
