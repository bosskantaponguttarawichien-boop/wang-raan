"use client";

/**
 * 2D Artboard — Hybrid DOM (% CSS) + SVG grid (architecture.md §5.3, design-system.md §7.2)
 * - วัตถุทุกชิ้นเป็น <button> วางตำแหน่งเป็น % ของขนาดร้าน → คมชัดทุกความละเอียด และได้ Tab/Focus ฟรี
 * - ลาก: Pointer Events + setPointerCapture; หนึ่งการลาก = Undo หนึ่งขั้น (begin/endInteraction)
 * - คีย์บอร์ด: ลูกศร = ย้าย 0.25 ม. (Shift = 1 ม.), R = หมุน 90° (Shift+R = −90°), Delete = ลบ, Esc = ยกเลิกการเลือก
 * - Non-blocking: วางทับหรือตกขอบได้ ผลตรวจแสดงเป็น Issue Rings
 * - หมุนมุมมอง: Stage (พิกัดผังจริง) หมุนด้วย CSS ทั้งชิ้นในกรอบขนาดมุมมอง; ลาก/ลูกศรแปลงทิศบนจอกลับเป็นทิศบนผัง
 *   และป้ายข้อความหมุนสวนกลับให้อ่านได้เสมอ
 */
import * as React from "react";
import {
  FURNITURE_COLOR_HEX,
  GRID_STEP,
  SIZE_STEP,
  chairStyleOf,
  footprint,
  tableStyleOf,
  type IssueSeverity,
  type LayoutObject,
  type Rect,
  type WallDoor,
} from "@/core/layout";
import { arrowKeyToPlan, viewSize } from "@/core/preview/view-rotation";
import { cn } from "@/lib/cn";
import { layoutActions as actions, useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import type { LiveValidation } from "@/components/validation/use-live-validation";
import { getTableNumbers } from "@/core/validation";
import { SimulationOverlay } from "@/components/simulation/simulation-overlay";
import { GridOverlay } from "./grid-overlay";
import { SelectionToolbar } from "./selection-toolbar";
import {
  WALL_LABEL,
  clientToMeters,
  deltaToMeters,
  nearestWallPosition,
  objectAriaLabel,
  objectLabel,
  percent,
} from "./stage-math";

type DragState =
  | { mode: "move"; id: string; pointerId: number; start: { x: number; y: number }; origin: { x: number; y: number } }
  | { mode: "resize"; id: string; pointerId: number; start: { x: number; y: number }; size: { width: number; depth: number } }
  | { mode: "entrance"; pointerId: number }
  | { mode: "kitchenDoor"; pointerId: number };

function boxStyle(rect: Rect, room: { width: number; depth: number }): React.CSSProperties {
  return {
    left: percent(rect.x, room.width),
    top: percent(rect.y, room.depth),
    width: percent(rect.width, room.width),
    height: percent(rect.depth, room.depth),
  };
}

function union(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.depth));
  return { x: x0, y: y0, width: x1 - x0, depth: y1 - y0 };
}

const RING: Record<IssueSeverity, string> = {
  blocked: "border-[var(--status-blocked)] shadow-[0_0_0_5px_var(--issue-ring-blocked)]",
  warning: "border-[var(--status-warning)] shadow-[0_0_0_5px_var(--issue-ring-warning)]",
};

const PIECE_STYLE: Record<LayoutObject["type"], string> = {
  counter: "z-[1] rounded-[4px] border-[1.5px] border-[var(--plan-counter-stroke)] bg-[var(--plan-counter-fill)]",
  table: "z-[2] rounded-[8px] border-[1.5px] border-[var(--plan-table-stroke)] bg-[var(--plan-table-fill)]",
  chair: "z-[3] rounded-full border-[1.5px] border-[var(--plan-chair-stroke)] bg-[var(--plan-chair-fill)]",
};

/** จุดบอกทิศด้านหน้าของเก้าอี้ */
const CHAIR_FRONT_DOT: Record<number, string> = {
  0: "left-1/2 top-[12%] -translate-x-1/2",
  90: "right-[12%] top-1/2 -translate-y-1/2",
  180: "left-1/2 bottom-[12%] -translate-x-1/2",
  270: "left-[12%] top-1/2 -translate-y-1/2",
};

/** พนักพิงอยู่ฝั่งตรงข้ามด้านหน้า (สตูลไม่มี) */
const CHAIR_BACKREST: Record<number, string> = {
  0: "inset-x-[14%] bottom-[6%] h-[16%]",
  90: "inset-y-[14%] left-[6%] w-[16%]",
  180: "inset-x-[14%] top-[6%] h-[16%]",
  270: "inset-y-[14%] right-[6%] w-[16%]",
};

/** ป้ายข้อความในผังหมุนสวนการหมุนมุมมอง (ค่าตั้งบน Stage) ให้ตั้งตรงบนจอเสมอ */
const UPRIGHT: React.CSSProperties = { rotate: "var(--view-upright, 0deg)" };

/** สี/ทรงที่ผู้ใช้เลือก — ผังที่ไม่มี style ใช้โทเคนเดิมของ design-system */
function pieceAppearance(obj: LayoutObject): { className?: string; style?: React.CSSProperties } {
  if (obj.type === "table") {
    const round = tableStyleOf(obj).shape === "round";
    return {
      className: round ? "rounded-full" : undefined,
      style: obj.style ? { backgroundColor: FURNITURE_COLOR_HEX[obj.style.color] } : undefined,
    };
  }
  if (obj.type === "chair") {
    // ค่าเริ่มต้นของเก้าอี้คือ rounded-full — ทรงเหลี่ยมใช้มุมมนเล็กแทน
    const square = chairStyleOf(obj).shape === "square";
    return {
      className: square ? "rounded-[22%]" : undefined,
      style: obj.style ? { backgroundColor: FURNITURE_COLOR_HEX[obj.style.color] } : undefined,
    };
  }
  return {};
}

function PieceDecoration({ obj }: { obj: LayoutObject }) {
  switch (obj.type) {
    case "counter":
      return <span aria-hidden="true" className="absolute right-[10%] top-[25%] h-[28%] w-[18%] rounded-[2px] bg-[var(--plan-counter-pos)]" />;
    case "chair":
      return (
        <>
          <span aria-hidden="true" className={cn("absolute size-[22%] rounded-full bg-[var(--plan-chair-stroke)]", CHAIR_FRONT_DOT[obj.rotation])} />
          {chairStyleOf(obj).kind === "chair" && (
            <span aria-hidden="true" data-testid="chair-backrest" className={cn("absolute rounded-full bg-[var(--plan-chair-stroke)]", CHAIR_BACKREST[obj.rotation])} />
          )}
        </>
      );
    default:
      return null;
  }
}

export interface ArtboardProps {
  live: LiveValidation;
  onToast?: (message: string) => void;
}

export function Artboard({ live, onToast = () => {} }: ArtboardProps) {
  const layout = useLayoutStore((s) => s.layout);
  const selectedId = useLayoutStore((s) => s.selectedObjectId);
  const zoom = useLayoutStore((s) => s.zoom);
  const viewRotation = useLayoutStore((s) => s.viewRotation);
  const simStatus = useSimulationStore((s) => s.status);
  const isSim = simStatus === "running" || simStatus === "paused";
  const stageRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const hintId = React.useId();

  const selected = layout.objects.find((o) => o.id === selectedId) ?? null;
  const groupTableId = selected?.type === "table" ? selected.id : selected?.type === "chair" ? selected.tableId : null;
  const groupRect = React.useMemo(() => {
    if (!groupTableId) return null;
    const members = layout.objects.filter(
      (o) => o.id === groupTableId || (o.type === "chair" && o.tableId === groupTableId),
    );
    return members.length > 1 ? union(members.map(footprint)) : null;
  }, [layout.objects, groupTableId]);

  const room = { width: layout.width, depth: layout.depth };
  const tableNumbers = React.useMemo(() => getTableNumbers(layout), [layout]);

  // ── Pointer: ย้าย / ปรับขนาด / ลากทางเข้า ───────────────────────────────
  const startDrag = (event: React.PointerEvent<HTMLElement>, state: DragState) => {
    if (event.button !== 0) return;
    // นิ้วที่สอง (isPrimary = false) คือกำลัง pinch ซูม — ไม่เริ่มลากวัตถุ
    if (event.pointerType === "touch" && !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    drag.current = state;
    actions().beginInteraction();
    setDraggingId(state.mode === "entrance" ? "entrance" : state.mode === "kitchenDoor" ? "kitchen-door" : state.id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current;
    const stage = stageRef.current;
    if (!state || !stage || state.pointerId !== event.pointerId) return;
    const rect = stage.getBoundingClientRect();
    const current = actions().layout;
    const rotation = actions().viewRotation;
    if (state.mode === "entrance") {
      const width = current.entrance?.width ?? 1.2;
      actions().setEntrance(nearestWallPosition(clientToMeters({ x: event.clientX, y: event.clientY }, rect, current, rotation), current, width));
      return;
    }
    if (state.mode === "kitchenDoor") {
      const width = current.kitchenDoor?.width ?? 0.9;
      actions().setKitchenDoor(nearestWallPosition(clientToMeters({ x: event.clientX, y: event.clientY }, rect, current, rotation), current, width));
      return;
    }
    const d = deltaToMeters(event.clientX - state.start.x, event.clientY - state.start.y, rect, current, rotation);
    if (state.mode === "move") {
      actions().updateObjectPosition(state.id, state.origin.x + d.x, state.origin.y + d.y);
    } else {
      const obj = current.objects.find((o) => o.id === state.id);
      if (!obj) return;
      const w = state.size.width + d.x;
      const h = state.size.depth + d.y;
      // ขนาดใน store เป็นขนาดก่อนหมุน
      if (obj.rotation % 180 === 0) actions().resizeObject(obj.id, w, h);
      else actions().resizeObject(obj.id, h, w);
    }
  };

  const finishDrag = () => {
    drag.current = null;
    actions().endInteraction();
    setDraggingId(null);
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    finishDrag();
  };

  // นิ้วที่สองแตะที่ใดก็ได้บนหน้าจอระหว่างลาก = เริ่ม pinch ซูม → หยุดลากทันที เพื่อไม่ให้วัตถุเลื่อนตามนิ้วแรก
  const finishDragRef = React.useRef(finishDrag);
  finishDragRef.current = finishDrag;
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary && drag.current) finishDragRef.current();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  const onPieceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, obj: LayoutObject) => {
    const move = arrowKeyToPlan(event.key, event.shiftKey ? 1 : GRID_STEP, viewRotation);
    if (move) {
      event.preventDefault();
      actions().selectObject(obj.id);
      actions().updateObjectPosition(obj.id, obj.x + move.x, obj.y + move.y);
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      actions().rotateObject(obj.id, event.shiftKey ? -90 : 90);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      actions().deleteObject(obj.id);
      stageRef.current?.parentElement?.focus();
    } else if (event.key === "Escape") {
      actions().selectObject(null);
    }
  };

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, obj: LayoutObject) => {
    const fp = footprint(obj);
    const d = arrowKeyToPlan(event.key, event.shiftKey ? GRID_STEP : SIZE_STEP, viewRotation);
    if (!d) return;
    event.preventDefault();
    const w = fp.width + d.x;
    const h = fp.depth + d.y;
    if (obj.rotation % 180 === 0) actions().resizeObject(obj.id, w, h);
    else actions().resizeObject(obj.id, h, w);
  };

  const onEntranceKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const entrance = layout.entrance;
    if (!entrance) return;
    const horizontal = entrance.wall === "north" || entrance.wall === "south";
    const move = arrowKeyToPlan(event.key, event.shiftKey ? 1 : GRID_STEP, viewRotation);
    const along = move ? (horizontal ? move.x : move.y) : 0;
    if (!along) return;
    event.preventDefault();
    actions().setEntrance({ wall: entrance.wall, position: entrance.position + along });
  };

  const onKitchenDoorKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const door = layout.kitchenDoor;
    if (!door) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      actions().removeKitchenDoor();
      return;
    }
    const horizontal = door.wall === "north" || door.wall === "south";
    const move = arrowKeyToPlan(event.key, event.shiftKey ? 1 : GRID_STEP, viewRotation);
    const along = move ? (horizontal ? move.x : move.y) : 0;
    if (!along) return;
    event.preventDefault();
    actions().setKitchenDoor({ wall: door.wall, position: door.position + along });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const view = viewSize(layout, viewRotation);
  const ratio = view.width / view.depth;
  // Stage วางในพิกัดผังจริง: หมุนรอบจุดกลางกรอบ — ขนาดเป็น % ของกรอบมุมมอง (90°/270° สลับกว้าง-ลึก)
  const stageStyle: React.CSSProperties =
    viewRotation === 0
      ? {}
      : ({
          left: "50%",
          top: "50%",
          right: "auto",
          bottom: "auto",
          width: percent(layout.width, view.width),
          height: percent(layout.depth, view.depth),
          transform: `translate(-50%, -50%) rotate(${viewRotation}deg)`,
          "--view-upright": `${-viewRotation}deg`,
        } as React.CSSProperties);
  // พอดีพื้นที่ Canvas จริง (cqw/cqh จาก container ของ Stage) เผื่อความสูงให้ป้ายความกว้างและคำแนะนำ (--artboard-chrome)
  // ค่า fallback 96px กัน width ทั้งก้อนเป็น invalid → auto (ผังหดเหลือแค่ขอบ) เมื่อ class ตั้งตัวแปรไม่ถูก generate
  const fitWidth = `min(100cqw, max(140px, 100cqh - var(--artboard-chrome, 96px)) * ${ratio})`;
  const entrance = layout.entrance;
  const entranceSeverity = entrance ? live.severityById.get(entrance.id) : undefined;
  const kitchenDoor = layout.kitchenDoor;
  const kitchenDoorSeverity = kitchenDoor ? live.severityById.get(kitchenDoor.id) : undefined;

  return (
    <div className="flex w-full min-w-0 flex-col items-center [--artboard-chrome:96px] max-[767px]:[--artboard-chrome:32px]">
      <div className="mb-3 flex items-center gap-3 text-[12px] text-secondary-strong max-[767px]:mb-1.5" style={{ width: `calc(${fitWidth} * ${zoom})`, maxWidth: "100%" }} aria-hidden="true">
        <span className="h-px flex-1 bg-[#ccd6e4]" />
        {view.width} เมตร
        <span className="h-px flex-1 bg-[#ccd6e4]" />
      </div>
      <div
        ref={boxRef}
        className="relative rounded-[2px] border-4 border-[var(--plan-wall)] bg-white"
        style={{
          width: `calc(${fitWidth} * ${zoom})`,
          aspectRatio: `${view.width} / ${view.depth}`,
          touchAction: "none",
        }}
      >
        <div
          ref={stageRef}
          role="application"
          aria-label={`ผังร้านขนาด ${layout.width} × ${layout.depth} เมตร${viewRotation ? ` (มุมมองหมุน ${viewRotation} องศา)` : ""}`}
          aria-describedby={hintId}
          className="absolute inset-0"
          style={stageStyle}
          data-testid="artboard-stage"
          data-view-rotation={viewRotation}
        >
          <GridOverlay width={layout.width} depth={layout.depth} />

          {groupRect && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-0 rounded-[10px] bg-[var(--table-group-ring)] shadow-[0_0_0_6px_var(--table-group-ring)]"
              style={boxStyle(groupRect, room)}
              data-testid="table-group-ring"
            />
          )}

          {layout.objects.map((obj) => {
            const rect = footprint(obj);
            const severity = live.severityById.get(obj.id);
            const isSelected = obj.id === selectedId;
            return (
              <button
                key={obj.id}
                type="button"
                data-id={obj.id}
                data-type={obj.type}
                data-issue={severity ?? undefined}
                aria-pressed={isSelected}
                aria-label={objectAriaLabel(obj, live.messageById.get(obj.id))}
                className={cn(
                  "absolute flex select-none items-center justify-center overflow-hidden whitespace-nowrap text-[clamp(9px,1.4vw,12px)] font-medium leading-none text-[#53677f]",
                  isSim ? "cursor-default" : "cursor-grab touch-none",
                  "transition-[box-shadow,border-color,opacity] duration-150 motion-reduce:transition-none",
                  "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2",
                  PIECE_STYLE[obj.type],
                  pieceAppearance(obj).className,
                  severity && RING[severity],
                  isSelected && !isSim && "z-[10] border-2 border-blue shadow-[0_0_0_5px_#3b62f422]",
                  isSelected && !isSim && severity === "blocked" && "shadow-[0_0_0_5px_#3b62f422,0_0_0_9px_var(--issue-ring-blocked)]",
                  isSelected && !isSim && severity === "warning" && "shadow-[0_0_0_5px_#3b62f422,0_0_0_9px_var(--issue-ring-warning)]",
                  draggingId === obj.id && "cursor-grabbing opacity-80 transition-none",
                )}
                style={{ ...boxStyle(rect, room), ...pieceAppearance(obj).style }}
                onPointerDown={(e) => {
                  if (isSim) {
                    e.preventDefault();
                    e.stopPropagation();
                    onToast('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
                    return;
                  }
                  actions().selectObject(obj.id);
                  startDrag(e, { mode: "move", id: obj.id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, origin: { x: obj.x, y: obj.y } });
                }}
                onPointerMove={isSim ? undefined : onPointerMove}
                onPointerUp={isSim ? undefined : endDrag}
                onPointerCancel={isSim ? undefined : endDrag}
                onClick={(e) => {
                  if (isSim) {
                    e.preventDefault();
                    e.stopPropagation();
                    onToast('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
                    return;
                  }
                  actions().selectObject(obj.id);
                }}
                onKeyDown={(e) => {
                  if (isSim) {
                    e.preventDefault();
                    return;
                  }
                  onPieceKeyDown(e, obj);
                }}
              >
                <PieceDecoration obj={obj} />
                {obj.type === "table" ? (
                  <span
                    // สีโต๊ะที่ผู้ใช้เลือกอาจเข้ม → รองพื้นขาวให้ป้ายยังผ่าน contrast 4.5:1
                    className={cn("relative px-1 font-semibold", obj.style && "rounded-[4px] bg-white/90 text-[#3d4f66]")}
                    style={UPRIGHT}
                  >{`โต๊ะ ${tableNumbers.get(obj.id) ?? ""}`}</span>
                ) : obj.type !== "chair" ? (
                  <span className="relative px-1" style={UPRIGHT}>{objectLabel(obj)}</span>
                ) : null}
              </button>
            );
          })}

          {!isSim && selected && selected.type === "counter" && (
            <button
              type="button"
              aria-label={`ปรับขนาด${objectLabel(selected)} (ลูกศรเพื่อปรับทีละ 0.05 ม.)`}
              className="absolute z-[11] size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-[3px] border-2 border-blue bg-white focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              style={{
                left: percent(footprint(selected).x + footprint(selected).width, layout.width),
                top: percent(footprint(selected).y + footprint(selected).depth, layout.depth),
                touchAction: "none",
              }}
              data-testid="resize-handle"
              onPointerDown={(e) => {
                const fp = footprint(selected);
                startDrag(e, { mode: "resize", id: selected.id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, size: { width: fp.width, depth: fp.depth } });
              }}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => onResizeKeyDown(e, selected)}
            />
          )}

          <SimulationOverlay width={layout.width} depth={layout.depth} />

          {entrance && (
            <DoorMarker
              kind="entrance"
              door={entrance}
              room={room}
              severity={entranceSeverity}
              message={live.messageById.get(entrance.id)}
              dragging={draggingId === "entrance"}
              onPointerDown={(e) => {
                if (isSim) {
                  e.preventDefault();
                  e.stopPropagation();
                  onToast('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
                  return;
                }
                startDrag(e, { mode: "entrance", pointerId: e.pointerId });
              }}
              onPointerMove={isSim ? () => {} : onPointerMove}
              onPointerUp={isSim ? () => {} : endDrag}
              onKeyDown={(e) => {
                if (isSim) {
                  e.preventDefault();
                  return;
                }
                onEntranceKeyDown(e);
              }}
              onClick={() => actions().setActiveTab("shop")}
            />
          )}

          {kitchenDoor && (
            <DoorMarker
              kind="kitchen"
              door={kitchenDoor}
              room={room}
              severity={kitchenDoorSeverity}
              message={live.messageById.get(kitchenDoor.id)}
              dragging={draggingId === "kitchen-door"}
              onPointerDown={(e) => {
                if (isSim) {
                  e.preventDefault();
                  e.stopPropagation();
                  onToast('ผังล็อกระหว่างจำลอง — กด "จบรอบ" ก่อนแก้ไข');
                  return;
                }
                startDrag(e, { mode: "kitchenDoor", pointerId: e.pointerId });
              }}
              onPointerMove={isSim ? () => {} : onPointerMove}
              onPointerUp={isSim ? () => {} : endDrag}
              onKeyDown={(e) => {
                if (isSim) {
                  e.preventDefault();
                  return;
                }
                onKitchenDoorKeyDown(e);
              }}
              onClick={() => actions().setActiveTab("shop")}
            />
          )}
        </div>
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
        {!isSim && selected && selected.type !== "table" && selected.type !== "chair" && !draggingId && (
          <SelectionToolbar
            boxRef={boxRef}
            room={room}
            objects={layout.objects}
            selected={selected}
            groupRect={groupRect}
            viewRotation={viewRotation}
            onToast={onToast}
          />
        )}
      </div>
      <p id={hintId} className="mt-3 max-w-[560px] text-center max-[767px]:sr-only text-[12px] leading-[1.75] text-secondary-strong">
        ลากเพื่อย้าย · ลูกศรเลื่อนทีละ 0.25 ม. (Shift = 1 ม.) · R หมุน 90° · Delete ลบ · กริดย่อย 0.25 ม. กริดหลัก 1 ม.
      </p>
    </div>
  );
}

interface DoorMarkerProps {
  kind: "entrance" | "kitchen";
  door: WallDoor;
  room: { width: number; depth: number };
  severity?: IssueSeverity;
  message?: string;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/** ทางเข้า / ประตูครัว: ช่องเปิดบนผนัง (design-system §7.2.3) */
function DoorMarker({ kind, door, room, severity, message, dragging, onClick, ...handlers }: DoorMarkerProps) {
  const horizontal = door.wall === "north" || door.wall === "south";
  const span = horizontal
    ? { left: percent(door.position, room.width), width: percent(door.width, room.width) }
    : { top: percent(door.position, room.depth), height: percent(door.width, room.depth) };
  const edge: React.CSSProperties =
    door.wall === "north"
      ? { top: -6, height: 8 }
      : door.wall === "south"
        ? { bottom: -6, height: 8 }
        : door.wall === "west"
          ? { left: -6, width: 8 }
          : { right: -6, width: 8 };

  const isEntrance = kind === "entrance";
  const swing: React.CSSProperties = horizontal
    ? { ...span, height: percent(door.width, room.depth), [door.wall === "north" ? "top" : "bottom"]: 0 }
    : { ...span, width: percent(door.width, room.width), [door.wall === "west" ? "left" : "right"]: 0 };
  const arc = { north: "M0 0V1A1 1 0 0 0 1 0", south: "M0 1V0A1 1 0 0 1 1 1", west: "M0 0H1A1 1 0 0 1 0 1", east: "M1 0H0A1 1 0 0 0 1 1" }[door.wall];

  const labelPrefix = isEntrance ? "ทางเข้า" : "ประตูครัว";
  const badgeText = isEntrance ? "เข้า" : "ครัว";
  const testId = isEntrance ? "entrance-marker" : "kitchen-door-marker";

  return (
    <>
      {isEntrance && (
        <svg aria-hidden="true" className="pointer-events-none absolute z-[4] overflow-visible" style={swing} viewBox="0 0 1 1" preserveAspectRatio="none">
          <path d={arc} fill="none" stroke="var(--plan-entrance-stroke)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <button
        type="button"
        id={door.id}
        data-id={door.id}
        aria-label={`${labelPrefix} ผนัง${WALL_LABEL[door.wall]} ตำแหน่ง ${door.position.toFixed(2)} ม. กว้าง ${door.width.toFixed(2)} ม. ลากหรือใช้ลูกศรเพื่อเลื่อน${message ? ` — ${message}` : ""}`}
        data-issue={severity ?? undefined}
        data-testid={testId}
        className={cn(
          "absolute z-[5] flex cursor-grab items-center justify-center rounded-[3px] border-[1.5px] text-[10px] font-medium leading-none touch-none",
          isEntrance
            ? "border-[var(--plan-entrance-stroke)] bg-[var(--plan-entrance-fill)] text-[#5a75a0] hover:text-blue"
            : "border-[#64748b] bg-[#f1f5f9] text-[#475569] hover:text-[#0f172a]",
          "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2",
          severity && RING[severity],
          dragging && (isEntrance ? "cursor-grabbing text-blue shadow-[0_3px_3px_#3b62f42b]" : "cursor-grabbing text-[#0f172a] shadow-[0_3px_3px_rgba(0,0,0,0.15)]"),
        )}
        style={{ ...span, ...edge }}
        onClick={onClick}
        {...handlers}
        onPointerCancel={handlers.onPointerUp}
      >
        <span style={UPRIGHT} className={cn("rounded-[3px] bg-white px-1 py-0.5", horizontal ? (door.wall === "north" ? "translate-y-3" : "-translate-y-3") : door.wall === "west" ? "translate-x-4" : "-translate-x-4")}>
          {badgeText}
        </span>
      </button>
    </>
  );
}
