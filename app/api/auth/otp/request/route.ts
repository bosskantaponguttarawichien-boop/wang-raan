import { createRequestOtpHandler } from "@/server/otp-handlers";

export const dynamic = "force-dynamic";

/** POST /api/auth/otp/request — ขอรหัส OTP 6 หลักส่งไปที่อีเมล */
export const POST = createRequestOtpHandler();
