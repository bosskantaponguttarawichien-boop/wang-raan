"use client";

/**
 * ภาพตัวอย่างชุดโต๊ะมุมบน (SVG) ก่อนวางลงผัง — จัดเก้าอี้ด้วย createTableSet ของ Core
 * ตำแหน่งจึงตรงกับที่จะวางจริง · ตกแต่งอย่างเดียว (aria-hidden) ข้อมูลอ่านได้จากคำบรรยายข้างใต้
 */
import * as React from "react";
import {
  FURNITURE_COLOR_HEX,
  createTableSet,
  footprint,
  resolveChairStyle,
  tableSeatCapacity,
  type ChairStyle,
  type TableStyle,
} from "@/core/layout";

const PAD = 0.15;
const STROKE = "#9aa7ba";

export interface TableSetPreviewProps {
  width: number;
  depth: number;
  chairCount: number;
  tableStyle: TableStyle;
  chairStyle: ChairStyle;
}

export function TableSetPreview({ width, depth, chairCount, tableStyle, chairStyle }: TableSetPreviewProps) {
  const set = React.useMemo(() => {
    const count = Math.max(1, Math.min(chairCount, tableSeatCapacity(width, depth)));
    let n = 0;
    return createTableSet("table-4-seats", { x: 0, y: 0 }, (prefix) => `${prefix}-${n++}`, {
      width,
      depth,
      chairCount: count,
      style: { table: tableStyle, chair: chairStyle },
    });
  }, [width, depth, chairCount, tableStyle, chairStyle]);

  const { table, chairs } = set;
  const rects = chairs.map(footprint);
  const minX = Math.min(table.x, ...rects.map((r) => r.x)) - PAD;
  const minY = Math.min(table.y, ...rects.map((r) => r.y)) - PAD;
  const maxX = Math.max(table.x + table.width, ...rects.map((r) => r.x + r.width)) + PAD;
  const maxY = Math.max(table.y + table.depth, ...rects.map((r) => r.y + r.depth)) + PAD;
  const cx = table.x + table.width / 2;
  const cy = table.y + table.depth / 2;
  const chair = resolveChairStyle(chairStyle);
  const chairFill = FURNITURE_COLOR_HEX[chair.color];
  const tableFill = FURNITURE_COLOR_HEX[tableStyle.color];

  return (
    <svg
      aria-hidden="true"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {rects.map((r, i) => {
        const inset = 0.04;
        const seat =
          chair.shape === "round" ? (
            <circle
              cx={r.x + r.width / 2}
              cy={r.y + r.depth / 2}
              r={Math.min(r.width, r.depth) / 2 - inset}
              fill={chairFill}
              stroke={STROKE}
              strokeWidth={0.02}
            />
          ) : (
            <rect
              x={r.x + inset}
              y={r.y + inset}
              width={r.width - 2 * inset}
              height={r.depth - 2 * inset}
              rx={0.07}
              fill={chairFill}
              stroke={STROKE}
              strokeWidth={0.02}
            />
          );
        if (chair.kind === "stool") return <React.Fragment key={chairs[i]!.id}>{seat}</React.Fragment>;
        // พนักพิงอยู่ขอบด้านที่ห่างจากโต๊ะ
        const dx = r.x + r.width / 2 - cx;
        const dy = r.y + r.depth / 2 - cy;
        const horizontal = Math.abs(dx) * table.depth > Math.abs(dy) * table.width;
        const back = 0.09;
        // เบาะกลม: พนักพิงสั้นลงให้อยู่ในขอบวงกลม
        const side = chair.shape === "round" ? 0.25 * Math.min(r.width, r.depth) : inset;
        const backRect = horizontal
          ? { x: dx > 0 ? r.x + r.width - inset - back : r.x + inset, y: r.y + side, w: back, h: r.depth - 2 * side }
          : { x: r.x + side, y: dy > 0 ? r.y + r.depth - inset - back : r.y + inset, w: r.width - 2 * side, h: back };
        return (
          <g key={chairs[i]!.id}>
            {seat}
            <rect x={backRect.x} y={backRect.y} width={backRect.w} height={backRect.h} rx={0.04} fill="#1e2b40" fillOpacity={0.28} />
          </g>
        );
      })}
      {tableStyle.shape === "round" ? (
        <circle cx={cx} cy={cy} r={table.width / 2} fill={tableFill} stroke={STROKE} strokeWidth={0.025} />
      ) : (
        <rect x={table.x} y={table.y} width={table.width} height={table.depth} rx={0.06} fill={tableFill} stroke={STROKE} strokeWidth={0.025} />
      )}
    </svg>
  );
}
