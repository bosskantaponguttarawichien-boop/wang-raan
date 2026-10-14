import "server-only";
/**
 * BFF POST /api/auth/otp/request (feat-061)
 * ส่งคำขอ OTP ไปยัง Backend (POST /v1/auth/otp/request)
 * Cooldown 60 วินาทีและอายุรหัส 10 นาที จัดการที่ Backend
 */
import { z } from "zod";
import { BackendConfigError, BackendError, backendClient, send, readBody } from "./backend";
import { json, problem, readJson, tooManyRequests, zodDetails } from "./http";
import { clientIp } from "./rate-limit";
import type { BackendClient } from "./token-relay";

export const OTP_REQUEST_MAX_BYTES = 1024;

const RequestOtpSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง").max(254),
}).strict();

export interface OtpHandlerDeps {
  client?: BackendClient;
}

export function createRequestOtpHandler(deps: OtpHandlerDeps = {}) {
  const client = deps.client ?? backendClient;

  return async function POST(request: Request): Promise<Response> {
    const read = await readJson(request, OTP_REQUEST_MAX_BYTES);
    if (!read.ok) return read.response;
    const parsed = RequestOtpSchema.safeParse(read.body);
    if (!parsed.success) {
      return problem(400, "INVALID_REQUEST", "กรุณาระบุอีเมลที่ถูกต้อง", {
        details: zodDetails(parsed.error),
      });
    }

    try {
      const res = await send(
        client,
        null,
        "/v1/auth/otp/request",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-client-ip": clientIp(request) },
          body: JSON.stringify({ email: parsed.data.email.trim().toLowerCase() }),
        },
        [400, 429],
      );

      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { error?: { retryAfter?: number } } | null;
        const retryAfter = body?.error?.retryAfter ?? 60;
        return tooManyRequests(`ขอรหัสถี่เกินไป กรุณารออีก ${retryAfter} วินาที`, retryAfter);
      }

      if (!res.ok) {
        return problem(400, "INVALID_REQUEST", "ไม่สามารถส่งรหัสได้ กรุณาตรวจสอบอีเมล");
      }

      const data = await readBody<{ sent: true; expiresIn: number }>(res);
      return json(data);
    } catch (error) {
      if (error instanceof BackendError && error.code === "RATE_LIMITED") {
        const retryAfter = Number(error.detail.retryAfter) || 60;
        return tooManyRequests(`ขอรหัสถี่เกินไป กรุณารออีก ${retryAfter} วินาที`, retryAfter);
      }
      if (error instanceof BackendError || error instanceof BackendConfigError) {
        console.error(
          "[wang-raan] ขอรหัส OTP ไม่สำเร็จ",
          error instanceof BackendError ? { status: error.status, code: error.code, cause: error.detail.cause } : error.message,
        );
        return problem(502, "DELIVERY_FAILED", "ส่งรหัสไม่สำเร็จ ลองใหม่ภายหลัง");
      }
      throw error;
    }
  };
}
