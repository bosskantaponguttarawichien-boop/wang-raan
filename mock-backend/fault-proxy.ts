/**
 * Proxy ฉีดความขัดข้องสำหรับ E2E กับ Backend จริง (wang-raan-service)
 * ส่งต่อทุกคำขอไป Backend จริง และรับคำสั่งควบคุม /__mock/* ชุดเดียวกับ Backend จำลอง เพื่อให้ E2E ชุดเดิมรันได้ทั้งสองแบบ:
 *   POST /__mock/reset · POST /__mock/outage { requests?, subject?, path? } — proxy ตอบ 503 เองแทน Backend
 *   POST /__mock/shares/{key}/expire — ตั้ง expires_at ในฐานข้อมูลจริงให้ผ่านไปแล้ว (Backend ตัดสินเองว่าหมดอายุ)
 */

export interface FaultProxyOptions {
  /** origin ของ Backend จริง เช่น http://127.0.0.1:4000 */
  target: string;
  /** ทำให้ลิงก์แชร์หมดอายุในฐานข้อมูล — คืน false ถ้าไม่พบ */
  expireShare: (shareKey: string) => Promise<boolean>;
  fetch?: typeof fetch;
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noContent = () => new Response(null, { status: 204 });
const simulatedOutage = () => json({ error: { code: "INTERNAL_ERROR", message: "simulated outage" } }, 503);

/** อ่าน sub จาก internal token โดยไม่ตรวจลายเซ็น (Backend จริงตรวจเองตอนรับคำขอ) */
function tokenSubject(request: Request): string | null {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const sub = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

export function createFaultProxy(options: FaultProxyOptions) {
  const doFetch = options.fetch ?? fetch;
  /** จำนวนคำขอถัดไปที่จะตอบ 503 (Infinity = ล่มจนกว่าจะสั่ง reset/outage 0) — ความหมายเดียวกับ Backend จำลอง */
  let outage = 0;
  let outageBySubject = new Map<string, number>();
  let outageByPath = new Map<string, number>();

  async function control(request: Request, pathname: string): Promise<Response> {
    if (request.method !== "POST") return json({ error: { code: "NOT_FOUND", message: "unknown control" } }, 404);
    if (pathname === "/__mock/reset") {
      outage = 0;
      outageBySubject = new Map();
      outageByPath = new Map();
      return noContent();
    }
    if (pathname === "/__mock/outage") {
      const body = (await request.json().catch(() => ({}))) as { requests?: number; subject?: string; path?: string };
      const count = body.requests === undefined ? Infinity : Math.max(0, body.requests);
      if (body.subject) outageBySubject.set(body.subject, count);
      else if (body.path) outageByPath.set(body.path, count);
      else outage = count;
      return noContent();
    }
    const expire = pathname.match(/^\/__mock\/shares\/([^/]+)\/expire$/);
    if (expire) {
      if (!(await options.expireShare(decodeURIComponent(expire[1]!)))) return json({ error: { code: "NOT_FOUND", message: "share not found" } }, 404);
      return noContent();
    }
    return json({ error: { code: "NOT_FOUND", message: "unknown control" } }, 404);
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__mock/")) return control(request, url.pathname);

    const pathOutage = outageByPath.get(url.pathname) ?? 0;
    if (outage > 0 || pathOutage > 0) {
      if (outage > 0) outage--;
      else outageByPath.set(url.pathname, pathOutage - 1);
      return simulatedOutage();
    }
    const subject = tokenSubject(request);
    const userOutage = subject ? (outageBySubject.get(subject) ?? 0) : 0;
    if (subject && userOutage > 0) {
      outageBySubject.set(subject, userOutage - 1);
      return simulatedOutage();
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return doFetch(new URL(url.pathname + url.search, options.target), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  }

  return { fetch: handle };
}
