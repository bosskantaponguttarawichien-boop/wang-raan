import { describe, expect, it } from "vitest";
import { subjectFor } from "./auth-config";

describe("subjectFor (id เจ้าของผัง)", () => {
  it("GitHub: ใช้ provider + providerAccountId ที่คงที่ ไม่ใช้ user.id ที่ Auth.js สุ่มใหม่ทุกครั้ง", () => {
    const account = { type: "oauth", provider: "github", providerAccountId: "583231" };
    expect(subjectFor({ id: "random-1" }, account)).toBe("github-583231");
    expect(subjectFor({ id: "random-2" }, account)).toBe("github-583231");
    expect(subjectFor({ id: "x" }, { ...account, type: "oidc" })).toBe("github-583231");
  });

  it("Guest (credentials): ใช้ id ที่ server สร้าง; ไม่ใช่จังหวะล็อกอิน → null", () => {
    expect(subjectFor({ id: "guest-abc" }, { type: "credentials", provider: "guest", providerAccountId: "guest-abc" })).toBe("guest-abc");
    expect(subjectFor(undefined, null)).toBeNull();
    expect(subjectFor({ id: null }, { type: "oauth", provider: "github" })).toBeNull();
  });
});
