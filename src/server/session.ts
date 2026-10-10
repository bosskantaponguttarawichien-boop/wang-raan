import "server-only";
/**
 * อ่านผู้ใช้จาก Session Cookie ของ Auth.js ใน Route Handler (ใช้ Request ตรง ๆ จึงทดสอบได้โดยไม่ต้องมี Next context)
 */
import { getToken } from "next-auth/jwt";
import { authSecret, type SessionUser } from "./auth-config";

export type ResolveUser = (request: Request) => Promise<SessionUser | null>;

/** Cookie ชื่อ __Secure-… เมื่อเว็บรันบน https (ตรงกับที่ Auth.js ตั้ง) */
function isSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proto ?? new URL(request.url).protocol.replace(":", "")) === "https";
}

export const getSessionUser: ResolveUser = async (request) => {
  const secret = authSecret();
  if (!secret) return null;
  const token = await getToken({ req: request, secret, secureCookie: isSecure(request) });
  if (!token?.sub) return null;
  return { id: token.sub, name: typeof token.name === "string" ? token.name : null };
};
