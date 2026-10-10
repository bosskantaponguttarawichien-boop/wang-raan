/**
 * Client ของ BFF (feat-033) — fetch แบบมี type และแปลง error ของ BFF (`{ error: { code, message } }`) เป็น ApiError
 */
import type { StoreLayout, ValidationResult } from "@/core/layout";

export interface LayoutSummaryDto {
  id: string;
  width: number;
  depth: number;
  objectCount: number;
  status: ValidationResult["status"];
  updatedAt: string;
}

export interface StoredLayoutDto {
  layout: StoreLayout;
  validation: ValidationResult;
  createdAt: string;
  updatedAt: string;
}

export type ShareStatus = "active" | "expired" | "revoked";

export interface ShareDto {
  shareKey: string;
  url: string;
  layoutId: string;
  status: ShareStatus;
  createdAt: string;
  /** null = ไม่หมดอายุ */
  expiresAt: string | null;
  revokedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK: Record<number, string> = {
  401: "กรุณาเข้าสู่ระบบก่อน",
  404: "ไม่พบข้อมูล",
  429: "ส่งคำขอถี่เกินไป กรุณารอสักครู่",
  502: "ระบบจัดเก็บผังขัดข้อง ลองใหม่ภายหลัง",
  503: "ระบบจัดเก็บข้อมูลไม่พร้อมใช้งานชั่วคราว ลองใหม่ภายหลัง",
};

async function request<T>(fetchImpl: typeof fetch, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(path, {
      ...init,
      credentials: "same-origin",
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, error?.code ?? `HTTP_${res.status}`, error?.message ?? FALLBACK[res.status] ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", body);
  }
  return body as T;
}

export function createApiClient(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  return {
    listLayouts: () => request<{ layouts: LayoutSummaryDto[] }>(fetchImpl, "/api/layouts").then((r) => r.layouts),
    getLayout: (id: string) => request<StoredLayoutDto>(fetchImpl, `/api/layouts/${encodeURIComponent(id)}`),
    /** บันทึก: อัปเดตถ้ามีอยู่แล้ว ไม่งั้นสร้างใหม่ (ถ้าเดาผิดจะสลับให้อัตโนมัติ) */
    async saveLayout(layout: StoreLayout, exists: boolean): Promise<StoredLayoutDto> {
      const body = JSON.stringify({ layout });
      const put = () => request<StoredLayoutDto>(fetchImpl, `/api/layouts/${encodeURIComponent(layout.id)}`, { method: "PUT", body });
      const post = () => request<StoredLayoutDto>(fetchImpl, "/api/layouts", { method: "POST", body });
      try {
        return await (exists ? put() : post());
      } catch (error) {
        if (error instanceof ApiError && ((exists && error.status === 404) || (!exists && error.status === 409))) {
          return exists ? post() : put();
        }
        throw error;
      }
    },
    deleteLayout: (id: string) => request<void>(fetchImpl, `/api/layouts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    createShare: (layoutId: string, expiresAt: string | null = null) =>
      request<ShareDto>(fetchImpl, "/api/share", { method: "POST", body: JSON.stringify(expiresAt ? { layoutId, expiresAt } : { layoutId }) }),
    listShares: (layoutId: string) =>
      request<{ shares: ShareDto[] }>(fetchImpl, `/api/layouts/${encodeURIComponent(layoutId)}/shares`).then((r) => r.shares),
    updateShare: (shareKey: string, expiresAt: string | null) =>
      request<ShareDto>(fetchImpl, `/api/share/${encodeURIComponent(shareKey)}`, { method: "PATCH", body: JSON.stringify({ expiresAt }) }),
    revokeShare: (shareKey: string) => request<void>(fetchImpl, `/api/share/${encodeURIComponent(shareKey)}`, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export const api = createApiClient();
