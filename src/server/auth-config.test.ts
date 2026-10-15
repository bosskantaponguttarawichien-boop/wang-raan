import { describe, expect, it } from "vitest";
import { isGuestId, oauthIdentity } from "./auth-config";

describe("oauthIdentity (ตัวตนที่ส่งให้ resolve)", () => {
  const google = { type: "oidc", provider: "google", providerAccountId: "1098765" };

  it("Google: ใช้ providerAccountId ที่คงที่ และเชื่อ email_verified", () => {
    expect(oauthIdentity(google, { email: "Alice@Example.com", email_verified: true }, { name: " Alice ", image: "https://x.test/a.png" })).toEqual({
      provider: "google",
      providerAccountId: "1098765",
      email: "alice@example.com",
      emailVerified: true,
      name: "Alice",
      image: "https://x.test/a.png",
    });
    expect(oauthIdentity(google, { email: "a@example.com", email_verified: false }, null)).toMatchObject({ emailVerified: false });
    expect(oauthIdentity(google, { email: "a@example.com" }, null)).toMatchObject({ emailVerified: false });
  });

  it("GitHub: emailVerified เป็น false เสมอ (ไม่ผูกบัญชีด้วยอีเมล)", () => {
    const account = { type: "oauth", provider: "github", providerAccountId: "583231" };
    expect(oauthIdentity(account, { email: "a@example.com", email_verified: true }, { email: "a@example.com" })).toMatchObject({
      provider: "github",
      providerAccountId: "583231",
      emailVerified: false,
    });
  });

  it("ค่าผิดรูปแบบจาก provider → null แทนที่จะทำให้ล็อกอินล้ม", () => {
    expect(oauthIdentity(google, { email: "not-an-email", email_verified: true }, { image: "javascript:alert(1)" })).toMatchObject({
      email: null,
      emailVerified: false,
      image: null,
    });
  });

  it("ไม่ใช่จังหวะล็อกอิน OAuth (credentials / ไม่มี account / provider ไม่รู้จัก) → null", () => {
    expect(oauthIdentity({ type: "credentials", provider: "guest" }, null, { email: "a@b.co" })).toBeNull();
    expect(oauthIdentity(null, null, null)).toBeNull();
    expect(oauthIdentity({ type: "oauth", provider: "facebook", providerAccountId: "1" }, null, null)).toBeNull();
    expect(oauthIdentity({ type: "oauth", provider: "github" }, null, null)).toBeNull();
  });
});

describe("isGuestId", () => {
  it("แยก Guest ออกจากบัญชีจริงทุกรูปแบบ (usr- และ id เดิม)", () => {
    expect(isGuestId("guest-0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isGuestId("usr-0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
    expect(isGuestId("github-583231")).toBe(false);
  });
});
