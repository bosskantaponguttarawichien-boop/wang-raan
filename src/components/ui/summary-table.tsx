import { cn } from "@/lib/cn";

export interface SummaryTableProps {
  rows: ReadonlyArray<readonly [label: string, value: string]>;
  /** ขนาดเล็กลงสำหรับรายงานพิมพ์ */
  compact?: boolean;
}

/** ตารางสรุปผัง (หัวข้อ | ค่า) — ใช้ในหน้าแชร์และรายงานพิมพ์ */
export function SummaryTable({ rows, compact = false }: SummaryTableProps) {
  const cell = compact ? "py-1" : "py-1.5";
  return (
    <table className={cn("w-full border-collapse", compact ? "text-[12px] leading-[1.7]" : "text-[13px] leading-[1.75]")}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-[#e3e9f2]">
            <th scope="row" className={cn(cell, "pr-3 text-left font-medium text-secondary-strong")}>
              {label}
            </th>
            <td className={cn(cell, "tabular-nums")}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
