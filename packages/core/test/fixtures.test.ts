/**
 * Fixture ของ smoke test package (feat-037) — ต้องตรงกับผลของ src/core เสมอ
 * ถ้าแก้กฎแล้วเทสต์นี้ fail: ตรวจว่าตั้งใจ แล้วรัน `UPDATE_CORE_FIXTURES=1 npx vitest run packages/core` เพื่อเขียน fixture ใหม่
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StoreLayout } from "@/core/layout";
import { validateLayout } from "@/core/validation";
import { cafeLayout } from "@/test/fixtures/layouts";

const dir = resolve(__dirname, "fixtures");

/** ผัง 3 สถานะ: Ready (fixture หลัก), Warning (โต๊ะไม่มีเก้าอี้), Blocked (ไม่มีทางเข้า) */
function cases(): Record<string, StoreLayout> {
  const ready = cafeLayout();
  const table = ready.objects.find((o) => o.type === "table");
  if (table?.type !== "table") throw new Error("fixture ต้องมีโต๊ะ");
  const warning: StoreLayout = {
    ...ready,
    objects: ready.objects
      .filter((o) => !(o.type === "chair" && o.tableId === table.id))
      .map((o) => (o.id === table.id ? { ...table, chairIds: [] } : o)),
  };
  return { ready, warning, blocked: { ...ready, entrance: null } };
}

function expected() {
  return Object.fromEntries(
    Object.entries(cases()).map(([name, layout]) => {
      const v = validateLayout(layout);
      return [name, { status: v.status, layoutRevision: v.layoutRevision, issueIds: v.issues.map((i) => i.id) }];
    }),
  );
}

const write = (file: string, data: unknown) => writeFileSync(resolve(dir, file), `${JSON.stringify(data, null, 2)}\n`);
const read = (file: string) => JSON.parse(readFileSync(resolve(dir, file), "utf8"));

if (process.env.UPDATE_CORE_FIXTURES) {
  write("layouts.json", cases());
  write("expected.json", expected());
}

describe("fixture ของ smoke test ตรงกับ src/core", () => {
  it("ผังใน layouts.json = ผังที่สร้างจาก fixture ของเทสต์", () => {
    expect(read("layouts.json")).toEqual(cases());
  });

  it("expected.json = ผลตรวจจาก validateLayout() ปัจจุบัน", () => {
    expect(read("expected.json")).toEqual(expected());
  });

  it("ครอบคลุมทั้ง 3 สถานะ", () => {
    expect(Object.values(read("expected.json")).map((e) => (e as { status: string }).status)).toEqual(["ready", "warning", "blocked"]);
  });
});
