"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  type LayoutObject,
  type StoreLayout,
  type Table,
  footprint,
  getChairsOfTable,
} from "@/core/layout";
import { buildIsoScene, isoFloorRect, ISO_PALETTE } from "@/core/preview/isometric";
import { SelectionToolbar } from "@/components/editor-2d/selection-toolbar";
import { IsoHeatmapLayer, IsoSimulationOverlay } from "@/components/simulation/iso-simulation-overlay";
import { layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { useContainerUnits } from "@/lib/use-container-units";

const SELECTION_BLUE = "#3b62f4";
const ThreeView = dynamic(() => import("./three-view").then((module) => module.ThreeView), { ssr: false });

export interface IsometricViewProps {
  onToast?: (message: string) => void;
}

/** มุมมอง 3D ของผังใน Editor — Three.js ถูกแยกเป็น lazy chunk; SVG ด้านล่างเป็น fallback */
export function IsometricView({ onToast = () => {} }: IsometricViewProps) {
  const layout = useLayoutStore((s) => s.layout);
  const zoom = useLayoutStore((s) => s.zoom);
  const selectedObjectId = useLayoutStore((s) => s.selectedObjectId);
  const simStatus = useSimulationStore((s) => s.status);
  const isSim = simStatus === "running" || simStatus === "paused";
  // JSDOM และเบราว์เซอร์ที่ไม่มี WebGL ต้องเห็น SVG ทันที ไม่รอ effect ของ ThreeView
  const [useSvgFallback, setUseSvgFallback] = React.useState(
    () =>
      typeof window === "undefined" ||
      typeof window.WebGLRenderingContext === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const showFallback = React.useCallback(() => setUseSvgFallback(true), []);
  const selected = layout.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedTable =
    selected?.type === "table"
      ? (selected as Table)
      : selected?.type === "chair"
        ? (layout.objects.find((object) => object.id === selected.tableId) as Table | undefined)
        : undefined;
  const keyboardTarget: LayoutObject | null = selectedTable ?? selected;

  // WebGL ต้องคงการแก้ผังด้วยคีย์บอร์ดแบบเดียวกับ SVG fallback ไว้
  React.useEffect(() => {
    if (useSvgFallback || isSim || !keyboardTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const active = event.target as HTMLElement | null;
      if (active?.closest("input, textarea, select, [contenteditable=true]")) return;

      const step = event.shiftKey ? 1 : 0.25;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        actions().updateObjectPosition(keyboardTarget.id, keyboardTarget.x + move[0], keyboardTarget.y + move[1]);
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        actions().rotateObject(keyboardTarget.id, event.shiftKey ? -90 : 90);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        const chairs =
          keyboardTarget.type === "table" ? getChairsOfTable(layout, keyboardTarget as Table) : [];
        actions().deleteObject(keyboardTarget.id);
        onToast(
          keyboardTarget.type === "table" && chairs.length > 0
            ? `ลบโต๊ะพร้อมเก้าอี้ ${chairs.length} ตัวแล้ว · กด Ctrl+Z เพื่อย้อน`
            : "ลบแล้ว · กด Ctrl+Z เพื่อย้อน",
        );
      } else if (event.key === "Escape") {
        actions().selectObject(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSim, keyboardTarget, layout, onToast, useSvgFallback]);

  if (!useSvgFallback) {
    return <ThreeView layout={layout} zoom={zoom} isSim={isSim} onUnavailable={showFallback} />;
  }

  return (
    <IsometricScene
      layout={layout}
      zoom={zoom}
      fill
      isSim={isSim}
      simulate
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
  simulate = false,
  selectedObjectId = null,
  onToast = () => {},
}: {
  layout: StoreLayout;
  zoom?: number;
  fill?: boolean;
  isSim?: boolean;
  /** แสดงลูกค้าจำลองและ heatmap (เฉพาะ Editor — หน้าแชร์ไม่มีการจำลอง) */
  simulate?: boolean;
  selectedObjectId?: string | null;
  onToast?: (message: string) => void;
}) {
  const scene = React.useMemo(() => buildIsoScene(layout), [layout]);
  // id ของ <defs> ต้องไม่ชนกันเมื่อมีหลายฉากในหน้าเดียว (และไม่มี ":" ที่ใช้ใน url() ไม่ได้)
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = {
    floor: `iso-floor-${uid}`,
    wallW: `iso-wall-w-${uid}`,
    wallN: `iso-wall-n-${uid}`,
    soft: `iso-soft-${uid}`,
    ao: `iso-ao-${uid}`,
    clip: `iso-clip-${uid}`,
    outline: `iso-outline-${uid}`,
  };
  const boxRef = React.useRef<HTMLDivElement>(null);
  const warnedRef = React.useRef(false);
  const cq = useContainerUnits(boxRef);

  // fill = เต็มพื้นที่ Canvas ของ Editor (cqw/cqh จาก container ของ Stage เผื่อความสูงให้คำอธิบาย); หน้าแชร์ใช้ขนาดคงที่
  const [, , vbWidth = 1, vbHeight = 1] = scene.viewBox.split(" ").map(Number);
  const fitWidth = fill ? `min(${cq.width}, max(140px, ${cq.height} - 48px) * ${vbWidth / vbHeight})` : "min(100%, 590px)";
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

  // แผ่นไฮไลต์บนพื้นครอบทั้งชุด (โต๊ะ + เก้าอี้ลูก) — เทียบกรอบ Selection ใน 2D
  const selectionPad = React.useMemo(() => {
    const rects = layout.objects.filter((o) => selectedMemberIds.has(o.id)).map(footprint);
    if (rects.length === 0) return null;
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    const width = Math.max(...rects.map((r) => r.x + r.width)) - x;
    const depth = Math.max(...rects.map((r) => r.y + r.depth)) - y;
    return isoFloorRect({ x, y, width, depth }, scene.scale, 0.1);
  }, [layout, selectedMemberIds, scene.scale]);

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
    <figure className="relative m-0 flex w-full flex-col items-center gap-3 max-[767px]:gap-0">
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
          <defs>
            <linearGradient id={ids.floor} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={ISO_PALETTE.floorFar} />
              <stop offset="1" stopColor={ISO_PALETTE.floor} />
            </linearGradient>
            {[ids.wallW, ids.wallN].map((id, i) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={ISO_PALETTE.wallInner[i]![0]} />
                <stop offset="1" stopColor={ISO_PALETTE.wallInner[i]![1]} />
              </linearGradient>
            ))}
            <filter id={ids.soft} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
            <filter id={ids.ao} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            {/* เส้นรอบเงารวมของชุดที่เลือก: ปิดช่องระหว่างขา (dilate 6 → erode 6) ให้เป็นก้อนเดียว
                แล้วขยายอีก 1 หน่วย ตัดก้อนเดิมออก เหลือเส้นขอบนอกเส้นเดียว */}
            <filter id={ids.outline} x="-10%" y="-10%" width="120%" height="120%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="fat" />
              <feMorphology in="fat" operator="erode" radius="6" result="closed" />
              <feMorphology in="fat" operator="erode" radius="5" result="grown" />
              <feComposite in="grown" in2="closed" operator="out" result="ring" />
              <feFlood floodColor={SELECTION_BLUE} />
              <feComposite in2="ring" operator="in" />
            </filter>
            <clipPath id={ids.clip}>
              <polygon points={scene.floor} />
            </clipPath>
          </defs>

          {/* ฐานพื้น + ผนังหลังหนา (ห้องตัดแบบ cutaway) — ไม่มีเส้นขอบ: stroke สีเดียวกับหน้า 0.5px ปิดรอยต่อ */}
          {scene.slab.map((points, i) => (
            <polygon key={`slab-${i}`} points={points} fill={ISO_PALETTE.slab[i]} stroke={ISO_PALETTE.slab[i]} strokeWidth={0.5} />
          ))}
          {scene.walls.map((points, i) => (
            <polygon
              key={`wall-${i}`}
              points={points}
              fill={`url(#${i === 0 ? ids.wallW : ids.wallN})`}
              stroke={`url(#${i === 0 ? ids.wallW : ids.wallN})`}
              strokeWidth={0.5}
            />
          ))}
          {scene.wallEnds.map((points, i) => (
            <polygon key={`wall-end-${i}`} points={points} fill={ISO_PALETTE.wallEnd} stroke={ISO_PALETTE.wallEnd} strokeWidth={0.5} />
          ))}
          <polygon points={scene.wallTop} fill={ISO_PALETTE.wallTop} stroke={ISO_PALETTE.wallTop} strokeWidth={0.5} />
          {scene.door && (
            <polygon points={scene.door} fill={ISO_PALETTE.door} stroke={ISO_PALETTE.doorFrame} strokeWidth={2.5} />
          )}

          <polygon points={scene.floor} fill={`url(#${ids.floor})`} stroke={`url(#${ids.floor})`} strokeWidth={0.5} />
          {scene.grid.map((l, i) => (
            <line key={`grid-${i}`} {...l} stroke={ISO_PALETTE.grid} strokeWidth={1} />
          ))}
          {/* เงามุมรอยต่อผนัง-พื้น (ambient occlusion) */}
          <g clipPath={`url(#${ids.clip})`} pointerEvents="none">
            <polyline
              points={scene.seam}
              fill="none"
              stroke={ISO_PALETTE.shadow}
              strokeOpacity={0.14}
              strokeWidth={14}
              strokeLinejoin="round"
              filter={`url(#${ids.ao})`}
            />
          </g>
          {scene.doormat && <polygon points={scene.doormat} fill={ISO_PALETTE.doormat} opacity={0.9} />}
          {simulate && <IsoHeatmapLayer scale={scene.scale} clipPathId={ids.clip} />}
          {selectionPad && (
            <polygon
              data-testid="iso-selection-pad"
              points={selectionPad}
              fill={SELECTION_BLUE}
              fillOpacity={0.08}
              stroke={SELECTION_BLUE}
              strokeOpacity={0.7}
              strokeWidth={1.2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}
          {scene.polygons.map((poly, i) => {
            return (
              <polygon
                key={i}
                points={poly.points}
                fill={poly.fill}
                stroke={poly.stroke}
                strokeWidth={poly.strokeWidth}
                strokeLinejoin="round"
                opacity={poly.opacity}
                transform={poly.offsetY ? `translate(0 ${poly.offsetY})` : undefined}
                filter={poly.kind === "shadow" ? `url(#${ids.soft})` : undefined}
                data-object-id={poly.objectId ?? undefined}
                className={poly.objectId && !isSim ? "cursor-pointer hover:opacity-90" : undefined}
              />
            );
          })}
          {selectedMemberIds.size > 0 && (
            <g data-testid="iso-selection-outline" filter={`url(#${ids.outline})`} pointerEvents="none">
              {scene.polygons
                .filter((poly) => poly.kind !== "shadow" && poly.objectId && selectedMemberIds.has(poly.objectId))
                .map((poly, i) => (
                  <polygon key={i} points={poly.points} fill="#000" />
                ))}
            </g>
          )}
          {scene.entrance && (
            <g>
              <circle cx={scene.entrance.x} cy={scene.entrance.y} r={5} fill={ISO_PALETTE.entrance} stroke="#fff" strokeWidth={2} />
              <text x={scene.entrance.x} y={scene.entrance.y - 12} textAnchor="middle" fontSize={12} fill="#5f7492" fontFamily="var(--font)">
                ทางเข้า
              </text>
            </g>
          )}
        </svg>

        {simulate && <IsoSimulationOverlay scene={scene} layout={layout} />}

        {!isSim && selected && selected.type !== "table" && selected.type !== "chair" && (
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

      <figcaption className="px-2 text-center max-[767px]:sr-only text-[12px] leading-[1.6] text-secondary-strong">
        ภาพตัวอย่าง Isometric จากผัง 2D เดียวกัน · คลิกเลือกวัตถุแล้วขยับด้วยปุ่มลูกศร
      </figcaption>
    </figure>
  );
}
