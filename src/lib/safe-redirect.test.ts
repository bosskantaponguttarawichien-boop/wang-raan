import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("อนุญาต path ภายในปกติ", () => {
    expect(safeRedirectPath("/projects")).toBe("/projects");
    expect(safeRedirectPath("/playground/123")).toBe("/playground/123");
    expect(safeRedirectPath("/playground?tab=shop")).toBe("/playground?tab=shop");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("แปลง URL ภายนอก / protocol-relative / scheme injection เป็น fallback (/projects)", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/projects");
    expect(safeRedirectPath("http://evil.com/projects")).toBe("/projects");
    expect(safeRedirectPath("//evil.com")).toBe("/projects");
    expect(safeRedirectPath("//evil.com/projects")).toBe("/projects");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/projects");
    expect(safeRedirectPath("/\\evil.com")).toBe("/projects");
    expect(safeRedirectPath(null)).toBe("/projects");
    expect(safeRedirectPath(undefined)).toBe("/projects");
    expect(safeRedirectPath("")).toBe("/projects");
  });

  it("อักขระที่เบราว์เซอร์ตัดทิ้งตอน parse (tab/newline) ใช้หลบเป็น //evil.com ไม่ได้", () => {
    expect(safeRedirectPath("/\t/evil.com")).toBe("/projects");
    expect(safeRedirectPath("/\n/evil.com")).toBe("/projects");
    expect(safeRedirectPath("/\r/evil.com")).toBe("/projects");
    expect(safeRedirectPath("/ /evil.com")).toBe("/projects");
    // ยืนยันว่าเป็นช่องโหว่จริงถ้าปล่อยผ่าน: URL parser มองเป็นโฮสต์อื่น
    expect(new URL("/\t/evil.com", "https://wang-raan.invalid").host).toBe("evil.com");
  });

  it("ใช้ custom fallback ได้", () => {
    expect(safeRedirectPath("https://evil.com", "/custom")).toBe("/custom");
  });
});
