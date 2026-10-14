/**
 * ตรวจสอบและคืนค่า redirect path ที่ปลอดภัย ป้องกัน Open Redirect (feat-062)
 * - อนุญาตเฉพาะ internal path ที่ขึ้นต้นด้วย "/" ตัวเดียว
 * - ป้องกัน protocol-relative URL ("//evil.com")
 * - ป้องกัน scheme injection ("javascript:", "data:", "https://")
 * - ป้องกัน backslash trick ("/\evil.com")
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/projects"): string {
  if (!target || typeof target !== "string") return fallback;
  const trimmed = target.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  // ป้องกัน colon ก่อน query string
  const queryIndex = trimmed.indexOf("?");
  const pathPart = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex);
  if (pathPart.includes(":")) return fallback;
  return trimmed;
}
