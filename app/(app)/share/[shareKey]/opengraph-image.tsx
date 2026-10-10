import { ImageResponse } from "next/og";
import { PLAN_COLORS, summarizeLayout } from "@/core/export";
import { footprint } from "@/core/layout";
import { shareRepository } from "@/server/share-repository";

/**
 * Dynamic OG Image ของลิงก์แชร์ (feat-030) — วาดผังจริงด้วยกล่อง (Satori ไม่รองรับ SVG ซับซ้อน)
 * ข้อความเป็นอังกฤษ/ตัวเลข เพราะฟอนต์ในตัวของ next/og ไม่มีอักษรไทย (เลี่ยงการโหลดฟอนต์จากภายนอกตอนสร้างภาพ)
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Wang-Raan shared store layout";

const STATUS = { ready: "Ready", warning: "Warning", blocked: "Blocked" } as const;
const STATUS_COLOR = { ready: "#2e9b78", warning: "#c08a2a", blocked: "#e4685d" } as const;

export default async function OpengraphImage({ params }: { params: Promise<{ shareKey: string }> }) {
  const shared = await shareRepository.get((await params).shareKey);
  if (!shared) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f8ff", color: "#1e2b40", fontSize: 56 }}>
          Wang-Raan
        </div>
      ),
      size,
    );
  }
  const { layout, validation } = shared;
  const s = summarizeLayout(layout, validation);
  // พื้นที่วาดผัง 620 × 520 px รักษาสัดส่วนจริง
  const scale = Math.min(620 / layout.width, 520 / layout.depth);
  const planW = layout.width * scale;
  const planH = layout.depth * scale;
  const order = { kitchen: 0, counter: 1, table: 2, chair: 3 } as const;
  const objects = [...layout.objects].sort((a, b) => order[a.type] - order[b.type]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f5f8ff", padding: 55, gap: 50, color: "#1e2b40" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            width: planW + 8,
            height: planH + 8,
            border: `4px solid ${PLAN_COLORS.wall}`,
            background: "#ffffff",
            alignSelf: "center",
          }}
        >
          {objects.map((obj) => {
            const r = footprint(obj);
            const c = PLAN_COLORS[obj.type];
            return (
              <div
                key={obj.id}
                style={{
                  position: "absolute",
                  left: r.x * scale,
                  top: r.y * scale,
                  width: r.width * scale,
                  height: r.depth * scale,
                  background: c.fill,
                  border: `2px solid ${c.stroke}`,
                  borderRadius: obj.type === "chair" ? 999 : obj.type === "table" ? 10 : 5,
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 18 }}>
          <div style={{ fontSize: 30, color: "#3b62f4" }}>Wang-Raan</div>
          <div style={{ fontSize: 60, lineHeight: 1.15 }}>{`${s.width} × ${s.depth} m store`}</div>
          <div style={{ fontSize: 34, color: "#4e627c" }}>{`${s.seats} seat${s.seats === 1 ? "" : "s"} · ${s.counts.table} table${s.counts.table === 1 ? "" : "s"}`}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: STATUS_COLOR[s.status] }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: STATUS_COLOR[s.status] }} />
            {STATUS[s.status]}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
