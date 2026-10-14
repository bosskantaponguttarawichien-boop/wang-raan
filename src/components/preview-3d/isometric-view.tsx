"use client";

import * as React from "react";
import {
  type LayoutObject,
  type StoreLayout,
  type Table,
  footprint,
  getChairsOfTable,
} from "@/core/layout";
import { buildIsoScene, ISO_PALETTE } from "@/core/preview/isometric";
import { SelectionToolbar } from "@/components/editor-2d/selection-toolbar";
import { layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";

export interface IsometricViewProps {
  onToast?: (message: string) => void;
}

/** มุมมอง 3D Isometric ของผังใน Editor (อ่านจาก store) */
export function IsometricView({ onToast = () => {} }: IsometricViewProps) {
  const layout = useLayoutStore((s) => s.layout);
  const zoom = useLayoutStore((s) => s.zoom);
  const selectedObjectId = useLayoutStore((s) => s.selectedObjectId);
  const simStatus = useSimulationStore((s) => s.status);
  const isSim = simStatus === "running" || simStatus === "paused";

  return (
    <IsometricScene
      layout={layout}
      zoom={zoom}
      fill
      isSim={isSim}
      selectedObjectId={selectedObjectId}
      onToast={onToast}
    />
  );
}

/** มุมมอง 3D Isometric ด้วย SVG ล้วน (design-system.md §7.3) — ไม่ใช้ WebGL / Three.js; ใช้ซ้ำในหน้าแชร์ */
export function IsometricScene({
  layout,
  zoom = 1,
  fill = false,
  isSim = false,
  selectedObjectId = null,
  onToast = () => {},
}: {
  layout: StoreLayout;
  zoom?: number;
  fill?: boolean;
  isSim?: boolean;
  selectedObjectId?: string | null;
  onToast?: (message: string) => void;
}) {
  const scene = React.useMemo(() => buildIsoScene(layout), [layout]);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const warnedRef = React.useRef(false);

  // fill = เต็มพื้นที่ Canvas ของ Editor (เผื่อความสูงให้แถบหัว คำอธิบาย และแถบสถานะ); หน้าแชร์ใช้ขนาดคงที่
  const [, , vbWidth = 1, vbHeight = 1] = scene.viewBox.split(" ").map(Number);
  const fitWidth = fill ? `min(100%, max(240px, 100dvh - 205px) * ${vbWidth / vbHeight})` : "min(100%, 590px)";
  const counts = {
    table: layout.objects.filter((o) => o.type === "table").length,
    chair: layout.objects.filter((o) => o.type === "chair").length,
  };

  const selected = layout.objects.find((o) => o.id === selectedObjectId) ?? null;
  const table =
    selected?.type === "table"
      ? (selected as Table)
      : selected?.type === "chair"
        ? (layout.objects.find((o) => o.id === selected.tableId) as Table | undefined)
        : undefined;
  const target: LayoutObject | null = table ?? selected;

  // เซ็ตของ ID ที่ถือว่าถูกเลือก (เช่นโต๊ะและเก้าอี้ลูกของโต๊ะ)
  const selectedMemberIds = React.useMemo(() => {
    if (!target) return new Set<string>();
    if (target.type === "table") {
      const chairIds = getChairsOfTable(layout, target as Table).map((c) => c.id);
      return new Set([target.id, ...chairIds]);
    }
    return new Set([target.id]);
  }, [layout, target]);

  // ── Keyboard handling in 3D ──────────────────────────────────────────────
  React.useEffect(() => {
    if (isSim || !target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest("input, textarea, select, [contenteditable=true]")) return;

      const step = e.shiftKey ? 1 : 0.25;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[e.key];
      if (move) {
        e.preventDefault();
        actions().updateObjectPosition(target.id, target.x + move[0], target.y + move[1]);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        actions().rotateObject(target.id, e.shiftKey ? -90 : 90);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (target.type === "table") {
          const chairs = getChairsOfTable(layout, target as Table);
          actions().deleteObject(target.id);
          onToast(
            chairs.length > 0
              ? `ลบโต๊ะพร้อมเก้าอี้ ${chairs.length} ตัวแล้ว · กด Ctrl+Z เพื่อย้อน`
              : "ลบโต๊ะแล้ว · กด Ctrl+Z เพื่อย้อน",
          );
        } else {
          actions().deleteObject(target.id);
          onToast("ลบแล้ว · กด Ctrl+Z เพื่อย้อน");
        }
      } else if (e.key === "Escape") {
        actions().selectObject(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSim, target, layout, onToast]);

  const handlePointerDown = (e: React.PointerEvent<SVGElement>) => {
    const el = e.target as SVGElement;
    const objId = el.dataset.objectId;

    if (isSim) {
      if (objId || el.tagName === "polygon") {
        onToast('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
      }
      return;
    }

    if (objId) {
      e.stopPropagation();
      actions().selectObject(objId);
      if (!warnedRef.current) {
        onToast("ใน 3D เลือกแล้วขยับด้วยปุ่มลูกศร · ลากได้ในมุมมอง 2D");
        warnedRef.current = true;
      }
    } else {
      actions().selectObject(null);
    }
  };

  const room = { width: layout.width, depth: layout.depth };

  return (
    <figure className="relative m-0 flex w-full flex-col items-center gap-3">
      {isSim && (
        <div
          data-testid="chip-lock"
          className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full bg-[#1e2b40]/85 px-3 py-1 text-[12px] font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] backdrop-blur-sm select-none"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>ผังล็อกระหว่างจำลอง</span>
        </div>
      )}

      <div
        ref={boxRef}
        className="relative flex items-center justify-center"
        style={{ width: `calc(${fitWidth} * ${zoom})`, maxWidth: "none" }}
      >
        <svg
          viewBox={scene.viewBox}
          role="img"
          aria-label={`ภาพตัวอย่างร้านแบบไอโซเมตริก ขนาด ${layout.width} × ${layout.depth} เมตร มีโต๊ะ ${counts.table} ตัว เก้าอี้ ${counts.chair} ตัว`}
          className="h-auto w-full [filter:var(--shadow-iso)] select-none"
          data-testid="iso-svg"
          onPointerDown={handlePointerDown}
        >
          {scene.walls.map((points, i) => (
            <polygon key={`wall-${i}`} points={points} fill={ISO_PALETTE.wall} stroke={ISO_PALETTE.wallStroke} strokeWidth={1.5} />
          ))}
          <polygon points={scene.floor} fill={ISO_PALETTE.floor} stroke={ISO_PALETTE.wallStroke} strokeWidth={2} />
          {scene.grid.map((l, i) => (
            <line key={`grid-${i}`} {...l} stroke={ISO_PALETTE.grid} strokeWidth={1} />
          ))}
          {scene.polygons.map((poly, i) => {
            const isMember = poly.objectId ? selectedMemberIds.has(poly.objectId) : false;
            return (
              <polygon
                key={i}
                points={poly.points}
                fill={poly.fill}
                stroke={isMember ? "#3b62f4" : poly.stroke}
                strokeWidth={isMember ? Math.max((poly.strokeWidth || 1) * 2, 2) : poly.strokeWidth}
                opacity={poly.opacity}
                transform={poly.offsetY ? `translate(0 ${poly.offsetY})` : undefined}
                data-object-id={poly.objectId ?? undefined}
                className={poly.objectId && !isSim ? "cursor-pointer hover:opacity-90" : undefined}
              />
            );
          })}
          {scene.entrance && (
            <g>
              <circle cx={scene.entrance.x} cy={scene.entrance.y} r={6} fill={ISO_PALETTE.entrance} />
              <text x={scene.entrance.x} y={scene.entrance.y - 12} textAnchor="middle" fontSize={12} fill="#5f7492" fontFamily="var(--font)">
                ทางเข้า
              </text>
            </g>
          )}
        </svg>

        {!isSim && selected && (
          <SelectionToolbar
            boxRef={boxRef}
            room={room}
            objects={layout.objects}
            selected={selected}
            groupRect={target ? footprint(target) : null}
            onToast={onToast}
          />
        )}
      </div>

      <figcaption className="px-2 text-center text-[12px] leading-[1.6] text-secondary-strong">
        ภาพตัวอย่าง Isometric จากผัง 2D เดียวกัน · คลิกเลือกวัตถุแล้วขยับด้วยปุ่มลูกศร
      </figcaption>
    </figure>
  );
}
