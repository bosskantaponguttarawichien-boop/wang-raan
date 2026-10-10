import { encode } from "next-auth/jwt";

/** Session cookie ของ Auth.js (http → ชื่อ authjs.session-token) สำหรับเทสต์ Route Handler */
export async function sessionCookie(userId: string, secure = false): Promise<string> {
  const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({
    token: { sub: userId, name: "ผู้ใช้ทั่วไป" },
    secret: "wang-raan-dev-secret-do-not-use-in-production",
    salt: name,
  });
  return `${name}=${token}`;
}
