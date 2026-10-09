import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Gate feat-002: โทเคนใน app/globals.css ต้องตรงกับ design-system.md 100%
const root = resolve(__dirname, "../..");
const spec = readFileSync(resolve(root, "design-system.md"), "utf8");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8").toLowerCase();

function section(start: string, end: string): string {
  const from = spec.indexOf(start);
  const to = spec.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`ไม่พบหัวข้อ ${start} ใน design-system.md`);
  return spec.slice(from, to);
}

const COLOR = /#[0-9a-fA-F]{6}\b|rgba\([^)]*\)/g;

/** แถวตาราง `| \`--token\` | value |` → [token, ค่าแรกในคอลัมน์ค่า] */
function tokenRows(md: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*`(--[a-z0-9-]+)`\s*\|\s*([^|]+)\|/);
    if (!m) continue;
    const value = m[2]!.match(COLOR)?.[0];
    if (value) rows.push([m[1]!, value.toLowerCase()]);
  }
  return rows;
}

function declared(token: string): string | undefined {
  const m = css.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
  return m?.[1]?.trim();
}

describe("design tokens ตรงกับ design-system.md", () => {
  const core = tokenRows(section("### 2.1 Core UI Tokens", "### 2.2"));
  const status = tokenRows(section("### 2.2 สถานะ", "### 2.3"));

  it("พบโทเคนในเอกสารครบ (กันการ parse พลาด)", () => {
    expect(core.length).toBeGreaterThanOrEqual(10);
    expect(status.length).toBeGreaterThanOrEqual(10);
  });

  it.each([...core, ...status])("%s = %s", (token, value) => {
    expect(declared(token)).toBe(value);
  });

  it("ทุกสีในตาราง 2D / 3D / Illustration (§2.3–§2.5) มีใน globals.css", () => {
    const colors = section("### 2.3", "## 3.").match(COLOR) ?? [];
    expect(colors.length).toBeGreaterThan(40);
    const missing = colors.map((c) => c.toLowerCase()).filter((c) => !css.includes(c));
    expect(missing).toEqual([]);
  });

  it("ทุกบรรทัดใน @theme ของ §11 มีใน globals.css", () => {
    const block = section("## 11.", "}\n```").split("@theme {")[1]!;
    const decls = block.match(/--[a-z0-9-]+:\s*[^;]+;/g) ?? [];
    expect(decls.length).toBeGreaterThan(15);
    const missing = decls.filter((d) => !css.includes(d.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it("spacing, shadow และ focus ring ตาม §4.1 / §5.2 / §5.3", () => {
    expect(declared("--page-gutter")).toBe("clamp(18px, 4vw, 52px)");
    expect(declared("--section-space")).toBe("clamp(44px, 6vw, 76px)");
    for (const [token, value] of tokenRows(section("### 5.2", "### 5.3"))) {
      expect(css).toContain(`${token}:`);
      expect(css).toContain(value);
    }
    expect(css).toMatch(/:focus-visible\s*{\s*outline:\s*3px solid var\(--focus\)/);
  });

  it("§8.2 ปิดแอนิเมชันเมื่อ prefers-reduced-motion และตอนพิมพ์", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
    expect(css).toMatch(/@media print[\s\S]*transition: none !important/);
  });
});
