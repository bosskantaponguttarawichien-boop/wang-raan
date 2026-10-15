/**
 * ตรวจสอบและคืนค่า redirect path ที่ปลอดภัย ป้องกัน Open Redirect (feat-062)
 * - อนุญาตเฉพาะ internal path ที่ขึ้นต้นด้วย "/" ตัวเดียว
 * - ป้องกัน protocol-relative URL ("//evil.com") และ backslash trick ("/\evil.com")
 * - ป้องกัน scheme injection ("javascript:", "data:", "https://")
 * - ป้องกันอักขระควบคุม/ช่องว่าง: URL parser ของเบราว์เซอร์ตัด tab/newline ทิ้ง ("/\t/evil.com" → "//evil.com")
 * - สุดท้ายให้ URL parser ตัดสิน: ต้อง resolve แล้วยังอยู่ origin เดิม
 */
const BASE = "https://wang-raan.invalid";

export function safeRedirectPath(target: string | null | undefined, fallback = "/projects"): string {
  if (!target || typeof target !== "string") return fallback;
  const trimmed = target.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001F\u007F\s]/.test(trimmed)) return fallback;
  // ป้องกัน colon ก่อน query string
  const queryIndex = trimmed.indexOf("?");
  const pathPart = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex);
  if (pathPart.includes(":")) return fallback;
  try {
    if (new URL(trimmed, BASE).origin !== BASE) return fallback;
  } catch {
    return fallback;
  }
  return trimmed;
}
