import { describe, expect, it } from "vitest";
import { createEntrance, type StoreLayout, type Wall } from "@/core/layout";
import { validateLayout } from "@/core/validation";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { escapeXml, renderPlanSvg } from "./plan-svg";
import { summarizeLayout } from "./summary";

const now = () => new Date("2026-10-10T03:00:00.000Z");

describe("summarizeLayout", () => {
  it("ผังคาเฟ่: นับชิ้น ที่นั่ง พื้นที่ และสถานะ", () => {
    const layout = cafeLayout();
    const summary = summarizeLayout(layout, validateLayout(layout, { now }));
    expect(summary).toMatchObject({
      width: 8,
      depth: 6,
      area: 48,
      counts: { kitchen: 1, counter: 1, table: 2, chair: 6 },
      tables: { twoSeats: 1, fourSeats: 1, custom: 0 },
      seats: 6,
      areaPerSeat: 8,
      status: "ready",
      issues: { blocked: 0, warning: 0 },
      entrance: { wall: "south", position: 1.25, width: 1.2 },
    });
  });

  it("เก้าอี้กำพร้าไม่นับเป็นที่นั่ง, โต๊ะไม่มี preset นับเป็น custom, นับ issue ตามหมวด", () => {
    const base = withoutType(cafeLayout(), "kitchen");
    const table = base.objects.find((o) => o.type === "table")!;
    const layout: StoreLayout = {
      ...base,
      entrance: null,
      objects: [
        ...base.objects.map((o) => (o.id === table.id && o.type === "table" ? { ...o, preset: undefined } : o)),
        { id: "orphan", type: "chair", tableId: "missing", x: 0, y: 0, width: 0.5, depth: 0.5, rotation: 0 },
      ],
    };
    const validation = validateLayout(layout, { now });
    const summary = summarizeLayout(layout, validation);
    expect(summary.seats).toBe(6);
    expect(summary.counts.chair).toBe(7);
    expect(summary.tables.custom).toBe(1);
    expect(summary.entrance).toBeNull();
    expect(summary.status).toBe("blocked");
    expect(summary.issues.blocked).toBeGreaterThan(0);
    expect(summary.issues.byCategory.completeness).toBeGreaterThan(0);

    const empty = { ...layout, objects: [] };
    expect(summarizeLayout(empty, validateLayout(empty, { now })).areaPerSeat).toBeNull();
  });
});

describe("renderPlanSvg (feat-025 gate: สัดส่วนตรงตามผังจริง)", () => {
  const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;

  it("ขนาด viewBox = ขนาดร้าน × px/m + ขอบ และวัตถุครบทุกชิ้นตามตำแหน่งจริง", () => {
    const layout = cafeLayout();
    const svg = renderPlanSvg(layout, { pxPerMeter: 50 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="472" height="372" viewBox="0 0 472 372"/);
    expect(count(svg, /data-type="table"/g)).toBe(2);
    expect(count(svg, /data-type="chair"/g)).toBe(6);
    expect(count(svg, /data-type="kitchen"/g)).toBe(1);
    expect(count(svg, /data-type="counter"/g)).toBe(1);
    // ครัว (0.5, 0.5) 2 × 1.5 ม. → (25, 25) 100 × 75 px
    expect(svg).toContain('<rect x="25" y="25" width="100" height="75"');
    expect(svg).toContain("<title>ผังร้านขนาด 8 × 6 เมตร</title>");
    expect(svg).toContain(">8 ม.</text>");
    expect(svg.endsWith("</svg>")).toBe(true);
    // กริด 0.25 ม.: (8/0.25 − 1) + (6/0.25 − 1) เส้น
    expect(count(svg, /<line /g)).toBe(31 + 23);
    expect(count(renderPlanSvg(layout, { grid: false }), /<line /g)).toBe(0);
  });

  it("วัตถุที่หมุน 90° ใช้ footprint ที่สลับกว้าง/ลึก", () => {
    const layout = cafeLayout();
    const counter = layout.objects.find((o) => o.type === "counter")!;
    const rotated = { ...layout, objects: layout.objects.map((o) => (o.id === counter.id ? { ...o, rotation: 90 as const, x: 7, y: 0.5 } : o)) };
    const svg = renderPlanSvg(rotated, { pxPerMeter: 10 });
    expect(svg).toContain(`<g data-id="${counter.id}" data-type="counter"><rect x="70" y="5" width="7" height="24"`);
  });

  it("Issue Rings ตามระดับปัญหา + escape ข้อความ", () => {
    const layout = cafeLayout();
    const kitchen = layout.objects.find((o) => o.type === "kitchen")!;
    const svg = renderPlanSvg(layout, {
      severityById: new Map([
        [kitchen.id, "blocked"],
        [layout.entrance!.id, "warning"],
      ]),
      title: 'ร้าน "A&B" <1>',
    });
    expect(count(svg, /data-issue="blocked"/g)).toBe(1);
    expect(svg).toContain('data-type="entrance" data-wall="south" data-issue="warning"');
    expect(svg).toContain("<title>ร้าน &quot;A&amp;B&quot; &lt;1&gt;</title>");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it.each<Wall>(["north", "south", "east", "west"])("วาดทางเข้าบนผนัง %s", (wall) => {
    const layout = cafeLayout();
    const svg = renderPlanSvg({ ...layout, entrance: createEntrance(layout, { wall, position: 1 }, () => "e") });
    expect(svg).toContain(`data-wall="${wall}"`);
    expect(svg).toContain(">เข้า</text>");
  });

  it("ไม่มีทางเข้า → ไม่วาด", () => {
    expect(renderPlanSvg({ ...cafeLayout(), entrance: null })).not.toContain('data-type="entrance"');
  });

  it("เก้าอี้มีจุดบอกทิศด้านหน้าทุกทิศ", () => {
    const layout = cafeLayout();
    const chairs = layout.objects.filter((o) => o.type === "chair");
    expect(new Set(chairs.map((c) => c.rotation)).size).toBe(4);
    expect(count(renderPlanSvg(layout), /<circle /g)).toBe(chairs.length);
  });
});
