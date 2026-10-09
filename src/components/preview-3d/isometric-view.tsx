"use client";

import { useMemo } from "react";
import { buildIsoScene, ISO_PALETTE } from "@/core/preview/isometric";
import { useLayoutStore } from "@/store/use-layout-store";

/** มุมมอง 3D Isometric ด้วย SVG ล้วน (design-system.md §7.3) — ไม่ใช้ WebGL / Three.js */
export function IsometricView() {
  const layout = useLayoutStore((s) => s.layout);
  const zoom = useLayoutStore((s) => s.zoom);
  const scene = useMemo(() => buildIsoScene(layout), [layout]);
  const counts = {
    table: layout.objects.filter((o) => o.type === "table").length,
    chair: layout.objects.filter((o) => o.type === "chair").length,
  };

  return (
    <figure className="m-0 flex w-full flex-col items-center gap-3">
      <svg
        viewBox={scene.viewBox}
        role="img"
        aria-label={`ภาพตัวอย่างร้านแบบไอโซเมตริก ขนาด ${layout.width} × ${layout.depth} เมตร มีโต๊ะ ${counts.table} ตัว เก้าอี้ ${counts.chair} ตัว`}
        className="h-auto w-full max-w-[590px] [filter:var(--shadow-iso)]"
        style={{ width: `calc(min(100%, 590px) * ${zoom})`, maxWidth: "none" }}
        data-testid="iso-svg"
      >
        {scene.walls.map((points, i) => (
          <polygon key={`wall-${i}`} points={points} fill={ISO_PALETTE.wall} stroke={ISO_PALETTE.wallStroke} strokeWidth={1.5} />
        ))}
        <polygon points={scene.floor} fill={ISO_PALETTE.floor} stroke={ISO_PALETTE.wallStroke} strokeWidth={2} />
        {scene.grid.map((l, i) => (
          <line key={`grid-${i}`} {...l} stroke={ISO_PALETTE.grid} strokeWidth={1} />
        ))}
        {scene.polygons.map((poly, i) => (
          <polygon
            key={i}
            points={poly.points}
            fill={poly.fill}
            stroke={poly.stroke}
            strokeWidth={poly.strokeWidth}
            opacity={poly.opacity}
            transform={poly.offsetY ? `translate(0 ${poly.offsetY})` : undefined}
            data-object-id={poly.objectId ?? undefined}
          />
        ))}
        {scene.entrance && (
          <g>
            <circle cx={scene.entrance.x} cy={scene.entrance.y} r={6} fill={ISO_PALETTE.entrance} />
            <text x={scene.entrance.x} y={scene.entrance.y - 12} textAnchor="middle" fontSize={12} fill="#5f7492" fontFamily="var(--font)">
              ทางเข้า
            </text>
          </g>
        )}
      </svg>
      <figcaption className="px-2 text-center text-[12px] leading-[1.6] text-secondary-strong">
        ภาพตัวอย่าง Isometric จากผัง 2D เดียวกัน · ใช้ดูบรรยากาศ ไม่ใช่แบบก่อสร้าง
      </figcaption>
    </figure>
  );
}
