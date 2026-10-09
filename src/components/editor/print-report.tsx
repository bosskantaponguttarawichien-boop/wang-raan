"use client";

/**
 * รายงานผังร้านสำหรับพิมพ์ / บันทึกเป็น PDF (feat-025, feat-026)
 * ซ่อนบนจอ (`hidden print:block`) และแสดงแทน Editor ตอนพิมพ์ — ผังวาดจาก SVG เวกเตอร์จึงคมทุกความละเอียด
 */
import * as React from "react";
import { renderPlanSvg, summarizeLayout } from "@/core/export";
import { STATUS_LABEL } from "@/components/ui";
import { WALL_LABEL } from "@/components/editor-2d/stage-math";
import { CATEGORY_LABEL } from "@/components/validation/validation-status-bar";
import type { LiveValidation } from "@/components/validation/use-live-validation";
import { useLayoutStore } from "@/store/use-layout-store";

const fmt = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function PrintReport({ live }: { live: LiveValidation }) {
  const layout = useLayoutStore((s) => s.layout);
  const { result, severityById } = live;
  const svg = React.useMemo(
    () => renderPlanSvg(layout, { pxPerMeter: 60, severityById, title: `ผังร้านขนาด ${layout.width} × ${layout.depth} เมตร` }),
    [layout, severityById],
  );
  const summary = React.useMemo(() => summarizeLayout(layout, result), [layout, result]);
  // เวลาที่พิมพ์จริง (อัปเดตตอนเปิดหน้าต่างพิมพ์)
  const [printedAt, setPrintedAt] = React.useState(() => new Date());
  React.useEffect(() => {
    const update = () => setPrintedAt(new Date());
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);

  const rows: Array<[string, string]> = [
    ["ขนาดร้าน", `${fmt(summary.width)} × ${fmt(summary.depth)} ม. (${fmt(summary.area)} ตร.ม.)`],
    [
      "ทางเข้า",
      summary.entrance
        ? `${WALL_LABEL[summary.entrance.wall as keyof typeof WALL_LABEL]} · กว้าง ${fmt(summary.entrance.width)} ม.`
        : "ยังไม่กำหนด",
    ],
    ["ที่นั่งทั้งหมด", `${summary.seats} ที่นั่ง`],
    [
      "ชุดโต๊ะ",
      `${summary.counts.table} ชุด (2 ที่นั่ง ${summary.tables.twoSeats} · 4 ที่นั่ง ${summary.tables.fourSeats}${summary.tables.custom ? ` · อื่น ๆ ${summary.tables.custom}` : ""})`,
    ],
    ["พื้นที่ต่อที่นั่ง", summary.areaPerSeat === null ? "—" : `${fmt(summary.areaPerSeat)} ตร.ม.`],
    ["ครัว / เคาน์เตอร์", `${summary.counts.kitchen} / ${summary.counts.counter}`],
  ];

  return (
    <article className="print-report hidden text-ink print:block" aria-label="รายงานผังร้านสำหรับพิมพ์" data-testid="print-report">
      <header className="mb-4 flex items-end justify-between border-b border-[#cfd8e6] pb-2">
        <div>
          <p className="m-0 text-[11px] text-secondary-strong">วางร้าน · รายงานผังร้าน</p>
          <h1 className="m-0 text-[20px] font-semibold leading-[1.4]">
            ผังร้าน {fmt(layout.width)} × {fmt(layout.depth)} เมตร
          </h1>
        </div>
        <p className="m-0 text-right text-[11px] leading-[1.6] text-secondary-strong">
          พิมพ์เมื่อ {printedAt.toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}
          <br />
          สถานะผัง: <strong data-testid="print-status">{STATUS_LABEL[summary.status]}</strong>
        </p>
      </header>

      {/* SVG สร้างจาก Core (escape ข้อความแล้ว) ไม่มีข้อมูลจากภายนอกที่ไม่ผ่านการ escape */}
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-6">
        <figure className="print-plan m-0" dangerouslySetInnerHTML={{ __html: svg }} />

        <div className="print-avoid-break grid gap-5">
          <section>
            <h2 className="m-0 mb-2 text-[14px] font-semibold">สรุปผัง</h2>
            <table className="w-full border-collapse text-[12px] leading-[1.7]">
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-[#e3e9f2]">
                    <th scope="row" className="py-1 pr-3 text-left font-medium text-secondary-strong">
                      {label}
                    </th>
                    <td className="py-1 tabular-nums">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="m-0 mb-2 text-[14px] font-semibold">ผลตรวจผัง</h2>
            {result.issues.length === 0 ? (
              <p className="m-0 text-[12px] leading-[1.7]">ผ่านทุกกฎ · พร้อมจำลองลูกค้า</p>
            ) : (
              <ul className="m-0 list-none p-0 text-[12px] leading-[1.7]">
                {result.issues.map((issue) => (
                  <li key={issue.id} className="border-b border-[#e3e9f2] py-1">
                    <strong className={issue.severity === "blocked" ? "text-[#b8433b]" : "text-[#8a6418]"}>
                      {issue.severity === "blocked" ? "ต้องแก้" : "ควรระวัง"}
                    </strong>{" "}
                    · {CATEGORY_LABEL[issue.category]} — {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}
