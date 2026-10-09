/**
 * Plan SVG Renderer (feat-025) — วาดผังด้านบนเป็นสตริง SVG เวกเตอร์ (สัดส่วนจริง 1 ม. = `pxPerMeter`)
 * Pure TypeScript ไม่พึ่ง DOM: ใช้ทั้งดาวน์โหลด .svg, แปลงเป็น PNG ฝั่ง Client และฝังในรายงานพิมพ์
 * สีตาม design-system.md §2.3 (Plan palette) — ใส่ค่า hex ตรง ๆ เพราะไฟล์ SVG ที่ส่งออกไม่มี CSS Variables
 */
import { footprint, objectCenter } from "../layout/geometry";
import type { IssueSeverity, LayoutObject, StoreLayout, Wall } from "../layout/types";

export const PLAN_COLORS = {
  background: "#ffffff",
  wall: "#b6c4d7",
  gridMinor: "#e9eef6",
  gridMajor: "#dce5f0",
  label: "#53677f",
  dimension: "#66758a",
  entranceStroke: "#9eb1ca",
  entranceLabel: "#6680a9",
  blocked: "#e4685d",
  warning: "#e5b762",
  kitchen: { fill: "#e8edf5", stroke: "#9bb0c9", detail: "#c4d3e5" },
  counter: { fill: "#e1e8f3", stroke: "#aebed3", detail: "#bdcce0" },
  table: { fill: "#edf1ff", stroke: "#8da6ef", detail: "#8da6ef" },
  chair: { fill: "#f8f0e5", stroke: "#d9ad7d", detail: "#d9ad7d" },
} as const;

const LABEL: Record<LayoutObject["type"], string> = { kitchen: "ครัว", counter: "เคาน์เตอร์", table: "โต๊ะ", chair: "เก้าอี้" };
const RADIUS: Record<LayoutObject["type"], number> = { kitchen: 0.06, counter: 0.06, table: 0.12, chair: 0.25 };

export interface PlanSvgOptions {
  /** พิกเซลต่อเมตร (ค่าเริ่มต้น 60) */
  pxPerMeter?: number;
  /** แสดงกริด 0.25 / 1 ม. (ค่าเริ่มต้น true) */
  grid?: boolean;
  /** ระดับปัญหาของแต่ละวัตถุ (จาก ValidationIssue.objectIds) เพื่อวาด Issue Rings */
  severityById?: ReadonlyMap<string, IssueSeverity>;
  /** ข้อความ <title> สำหรับ Screen Reader */
  title?: string;
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

const n = (v: number) => String(Math.round(v * 100) / 100);

export function renderPlanSvg(layout: StoreLayout, options: PlanSvgOptions = {}): string {
  const s = options.pxPerMeter ?? 60;
  const margin = 36;
  const w = layout.width * s;
  const h = layout.depth * s;
  const totalW = w + margin * 2;
  const totalH = h + margin * 2;
  const title = options.title ?? `ผังร้านขนาด ${layout.width} × ${layout.depth} เมตร`;
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(totalW)}" height="${n(totalH)}" viewBox="0 0 ${n(totalW)} ${n(totalH)}" role="img" font-family="'Noto Sans Thai', Tahoma, sans-serif">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="100%" height="100%" fill="${PLAN_COLORS.background}"/>`,
    // เส้นบอกระยะ (Dimension line) ด้านบนและด้านซ้าย
    `<g fill="${PLAN_COLORS.dimension}" font-size="12" text-anchor="middle">`,
    `<text x="${n(margin + w / 2)}" y="${n(margin - 14)}">${n(layout.width)} ม.</text>`,
    `<text x="${n(margin - 14)}" y="${n(margin + h / 2)}" transform="rotate(-90 ${n(margin - 14)} ${n(margin + h / 2)})">${n(layout.depth)} ม.</text>`,
    `</g>`,
    `<g transform="translate(${margin} ${margin})">`,
  );

  if (options.grid ?? true) {
    const lines: string[] = [];
    const steps = (len: number) => Math.round(len / 0.25);
    for (let i = 1; i < steps(layout.width); i++) {
      const major = i % 4 === 0;
      lines.push(`<line x1="${n(i * 0.25 * s)}" y1="0" x2="${n(i * 0.25 * s)}" y2="${n(h)}" stroke="${major ? PLAN_COLORS.gridMajor : PLAN_COLORS.gridMinor}"/>`);
    }
    for (let i = 1; i < steps(layout.depth); i++) {
      const major = i % 4 === 0;
      lines.push(`<line x1="0" y1="${n(i * 0.25 * s)}" x2="${n(w)}" y2="${n(i * 0.25 * s)}" stroke="${major ? PLAN_COLORS.gridMajor : PLAN_COLORS.gridMinor}"/>`);
    }
    out.push(`<g stroke-width="1" data-layer="grid">${lines.join("")}</g>`);
  }

  // วาดเรียงชั้น: ครัว/เคาน์เตอร์ → โต๊ะ → เก้าอี้ (เหมือน z-index บน Artboard)
  const order: LayoutObject["type"][] = ["kitchen", "counter", "table", "chair"];
  const objects = [...layout.objects].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const obj of objects) out.push(renderObject(obj, s, options.severityById?.get(obj.id)));

  out.push(`<rect x="-2" y="-2" width="${n(w + 4)}" height="${n(h + 4)}" fill="none" stroke="${PLAN_COLORS.wall}" stroke-width="4"/>`);
  if (layout.entrance) out.push(renderEntrance(layout, s, options.severityById?.get(layout.entrance.id)));
  out.push(`</g></svg>`);
  return out.join("");
}

function renderObject(obj: LayoutObject, s: number, severity?: IssueSeverity): string {
  const r = footprint(obj);
  const c = PLAN_COLORS[obj.type];
  const x = r.x * s;
  const y = r.y * s;
  const w = r.width * s;
  const h = r.depth * s;
  const radius = obj.type === "chair" ? Math.min(w, h) / 2 : RADIUS[obj.type] * s;
  const parts = [`<g data-id="${escapeXml(obj.id)}" data-type="${obj.type}">`];
  if (severity) {
    parts.push(
      `<rect x="${n(x - 4)}" y="${n(y - 4)}" width="${n(w + 8)}" height="${n(h + 8)}" rx="${n(radius + 4)}" fill="none" stroke="${PLAN_COLORS[severity]}" stroke-width="3" stroke-opacity="0.85" data-issue="${severity}"/>`,
    );
  }
  parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(radius)}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`);
  if (obj.type === "chair") {
    // จุดบอกทิศด้านหน้าของเก้าอี้
    const center = objectCenter(obj);
    const dir = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] }[obj.rotation];
    const off = Math.min(w, h) * 0.3;
    parts.push(`<circle cx="${n(center.x * s + dir[0]! * off)}" cy="${n(center.y * s + dir[1]! * off)}" r="${n(Math.min(w, h) * 0.11)}" fill="${c.detail}"/>`);
  } else {
    const size = Math.max(8, Math.min(13, Math.min(w, h) * 0.32));
    parts.push(
      `<text x="${n(x + w / 2)}" y="${n(y + h / 2)}" font-size="${n(size)}" fill="${PLAN_COLORS.label}" text-anchor="middle" dominant-baseline="central">${LABEL[obj.type]}</text>`,
    );
  }
  parts.push(`</g>`);
  return parts.join("");
}

function renderEntrance(layout: StoreLayout, s: number, severity?: IssueSeverity): string {
  const e = layout.entrance!;
  const W = layout.width * s;
  const H = layout.depth * s;
  const a = e.position * s;
  const len = e.width * s;
  // ช่องเปิดบนผนัง (ทับเส้นผนังด้วยสีพื้นหลัง)
  const gap: Record<Wall, [number, number, number, number]> = {
    north: [a, -4, len, 6],
    south: [a, H - 2, len, 6],
    west: [-4, a, 6, len],
    east: [W - 2, a, 6, len],
  };
  // วงสวิงประตูเปิดเข้าในร้าน (บานพับที่ต้นช่อง)
  const arc: Record<Wall, string> = {
    north: `M${n(a)} 0 V${n(len)} A${n(len)} ${n(len)} 0 0 0 ${n(a + len)} 0`,
    south: `M${n(a)} ${n(H)} V${n(H - len)} A${n(len)} ${n(len)} 0 0 1 ${n(a + len)} ${n(H)}`,
    west: `M0 ${n(a)} H${n(len)} A${n(len)} ${n(len)} 0 0 1 0 ${n(a + len)}`,
    east: `M${n(W)} ${n(a)} H${n(W - len)} A${n(len)} ${n(len)} 0 0 0 ${n(W)} ${n(a + len)}`,
  };
  const [gx, gy, gw, gh] = gap[e.wall];
  const labelPos: Record<Wall, [number, number]> = {
    north: [a + len / 2, 16],
    south: [a + len / 2, H - 10],
    west: [16, a + len / 2],
    east: [W - 16, a + len / 2],
  };
  const [lx, ly] = labelPos[e.wall];
  const stroke = severity ? PLAN_COLORS[severity] : PLAN_COLORS.entranceStroke;
  return [
    `<g data-type="entrance" data-wall="${e.wall}"${severity ? ` data-issue="${severity}"` : ""}>`,
    `<rect x="${n(gx)}" y="${n(gy)}" width="${n(gw)}" height="${n(gh)}" fill="${PLAN_COLORS.background}" stroke="${stroke}" stroke-width="1.5"/>`,
    `<path d="${arc[e.wall]}" fill="none" stroke="${PLAN_COLORS.entranceStroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    `<text x="${n(lx)}" y="${n(ly)}" font-size="11" fill="${PLAN_COLORS.entranceLabel}" text-anchor="middle" dominant-baseline="central">เข้า</text>`,
    `</g>`,
  ].join("");
}
