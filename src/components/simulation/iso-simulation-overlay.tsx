"use client";

/**
 * Simulation ในมุมมอง 3D Isometric — คู่กับ SimulationOverlay ของ 2D (architecture.md §5.3.3)
 * - ลูกค้า: วาดลง <canvas> ทับ SVG เป็นตัวคน chibi (iso-person.ts) ยืนบนพื้นตามพิกัดที่ฉายแล้ว
 *   หันตามทิศที่เดิน แขนขาแกว่งตามระยะทาง และมีวงสีสถานะใต้เท้า
 *   interpolate ระหว่าง tick ด้วย requestAnimationFrame และไม่ re-render React ระหว่างเล่น
 * - Heatmap: <image> ใน SVG แปะบนพื้นด้วย matrix ของการฉาย isometric (เป็น affine) — อยู่ใต้เฟอร์นิเจอร์
 * - prefers-reduced-motion: ไม่ interpolate และวาดใหม่ไม่เกินวินาทีละครั้ง (เหมือน 2D)
 */
import * as React from "react";
import { directionVector, footprint, type StoreLayout } from "@/core/layout";
import { AGENT_STRIDE } from "@/core/simulation";
import { ISO_ORIGIN_X, ISO_ORIGIN_Y, projectPoint, type IsoScene } from "@/core/preview/isometric";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getSimulationController, type HeatmapFrame } from "./simulation-controller";
import { behaviorFromState, drawPerson, facingFrom, personLook, type Facing, type PersonLook } from "./iso-person";
import { AGENT_COLORS, interpolateAgents, paintHeatmap } from "./simulation-overlay";

const TICK_MS = 50;
const HEAT_CELL = 0.25;
const SEATED = 4;
/** ระยะเดิน (เมตร) ต่อหนึ่งรอบก้าว (ซ้าย + ขวา) */
const STRIDE_M = 0.7;

export interface IsoAgentSprite {
  id: number;
  /** ตำแหน่งในผัง (เมตร) */
  mx: number;
  my: number;
  /** จุดบนพื้นใน viewBox */
  x: number;
  y: number;
  state: number;
}

/** ฉายตำแหน่งลูกค้า (เมตร) เป็นจุดบนพื้นใน viewBox แล้วเรียงไกล → ใกล้ ให้คนที่อยู่ใกล้วาดทับ */
export function projectAgents(agents: Array<[number, number, number, number]>, scale: number): IsoAgentSprite[] {
  return [...agents]
    .sort((a, b) => a[1] + a[2] - (b[1] + b[2]))
    .map(([id, mx, my, state]) => {
      const [x, y] = projectPoint(mx, my, 0, scale);
      return { id, mx, my, x, y, state };
    });
}

/** ทิศที่คนนั่งควรหัน = ทิศด้านหน้าของเก้าอี้ที่ใกล้ที่สุด (หันเข้าโต๊ะ) */
export function seatedFacing(layout: StoreLayout, mx: number, my: number, previous: Facing): Facing {
  let best: { d: number; rotation: number } | null = null;
  for (const o of layout.objects) {
    if (o.type !== "chair") continue;
    const r = footprint(o);
    const d = Math.hypot(r.x + r.width / 2 - mx, r.y + r.depth / 2 - my);
    if (d < 0.6 && (!best || d < best.d)) best = { d, rotation: o.rotation };
  }
  if (!best) return previous;
  const f = directionVector(best.rotation as Parameters<typeof directionVector>[0]);
  return facingFrom(f.x, f.y, previous);
}

/** สถานะต่อคนที่ต้องจำข้ามเฟรม: ตำแหน่งล่าสุด ทิศที่หัน และจังหวะก้าว */
interface Walker {
  look: PersonLook;
  mx: number;
  my: number;
  facing: Facing;
  phase: number;
  walking: boolean;
}

/** Canvas ทับฉาก 3D — ต้องอยู่ในกล่องเดียวกับ SVG (ขนาดเท่ากัน) */
export function IsoSimulationOverlay({ scene, layout }: { scene: IsoScene; layout: StoreLayout }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const status = useSimulationStore((s) => s.status);
  const active = status === "running" || status === "paused";
  // อ่านผังผ่าน ref — ไม่ใส่ใน deps ของ effect ข้างล่าง (ผังล็อกระหว่างจำลองอยู่แล้ว และไม่อยากเริ่ม loop/สถานะท่าเดินใหม่)
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const controller = getSimulationController();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const [minX = 0, minY = 0, vbWidth = 1] = scene.viewBox.split(" ").map(Number);
    let frame = 0;
    let lastDraw = -Infinity;
    let dirty = true;
    const walkers = new Map<number, Walker>();
    const size = Math.min(1.25, Math.max(0.7, scene.scale / 30));

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        dirty = true;
      }
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    resize();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (reduceMotion && (!dirty || now - lastDraw < 1000)) return;
      dirty = false;
      lastDraw = now;

      const { previous, current } = controller;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!active || !current) return;
      // viewBox → พิกเซลของ canvas (SVG รักษาสัดส่วน จึงใช้ scale เดียว)
      const k = canvas.width / vbWidth;
      ctx.setTransform(k, 0, 0, k, -minX * k, -minY * k);
      const t = reduceMotion ? 1 : Math.min(1, (now - current.at) / TICK_MS);
      // interpolateAgents เรียงตาม current.agents จึงจับคู่ id ด้วยลำดับเดียวกัน
      const positions = interpolateAgents(previous, current, t);
      const withIds = positions.map(([x, y, state], i) => [current.agents[i * AGENT_STRIDE]!, x, y, state] as [number, number, number, number]);
      const seen = new Set<number>();
      for (const sprite of projectAgents(withIds, scene.scale)) {
        seen.add(sprite.id);
        let w = walkers.get(sprite.id);
        if (!w) {
          w = { look: personLook(sprite.id), mx: sprite.mx, my: sprite.my, facing: { front: true, right: true }, phase: 0, walking: false };
          walkers.set(sprite.id, w);
        }
        const dx = sprite.mx - w.mx;
        const dy = sprite.my - w.my;
        const dist = Math.hypot(dx, dy);
        // กระโดดไกล (ลุกจากเก้าอี้/เริ่มใหม่) ไม่นับเป็นการเดิน
        if (dist < 0.5) {
          w.facing = facingFrom(dx, dy, w.facing);
          w.phase += (dist / STRIDE_M) * Math.PI * 2;
        }
        w.walking = dist > 1e-3 && dist < 0.5;
        if (sprite.state === SEATED) w.facing = seatedFacing(layoutRef.current, sprite.mx, sprite.my, w.facing);
        w.mx = sprite.mx;
        w.my = sprite.my;
        drawPerson(ctx, sprite.x, sprite.y, {
          look: w.look,
          facing: w.facing,
          behavior: behaviorFromState(sprite.state),
          phase: w.phase,
          walking: w.walking && !reduceMotion,
          seated: sprite.state === SEATED,
          ring: AGENT_COLORS[sprite.state] ?? AGENT_COLORS[0],
          size,
        });
      }
      for (const id of walkers.keys()) if (!seen.has(id)) walkers.delete(id);
    };
    frame = requestAnimationFrame(draw);
    const unsubscribe = controller.subscribe(() => {
      dirty = true;
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      unsubscribe();
    };
  }, [scene, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="iso-simulation-overlay"
      data-active={active}
      className="pointer-events-none absolute inset-0 z-[20] h-full w-full"
    />
  );
}

/**
 * Heatmap บนพื้น 3D (ใช้ภายใน <svg> ของฉาก) — วาดหลังพื้น/กริด ก่อนเฟอร์นิเจอร์
 * matrix(s, 0.52s, −s, 0.52s, originX, originY) แปลงเมตร → viewBox ตรงกับ projectPoint ที่ z = 0
 */
export function IsoHeatmapLayer({ scale, clipPathId }: { scale: number; clipPathId: string }) {
  const imageRef = React.useRef<SVGImageElement>(null);
  const status = useSimulationStore((s) => s.status);
  const showHeatmap = useSimulationStore((s) => s.showHeatmap);
  const active = status === "running" || status === "paused";

  React.useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const controller = getSimulationController();
    const heat = document.createElement("canvas");
    const heatCtx = heat.getContext("2d");
    let source: HeatmapFrame | null = null;
    let paintedAt = -Infinity;

    const update = () => {
      const heatmap = showHeatmap ? controller.heatmap : null;
      if (!heatmap || !heatCtx) {
        image.setAttribute("visibility", "hidden");
        source = null;
        return;
      }
      image.setAttribute("visibility", "visible");
      // heatmap มาพร้อม tick (20 ครั้ง/วินาที) — สร้างภาพใหม่ไม่เกิน 4 ครั้ง/วินาที
      const now = performance.now();
      if (heatmap === source || (source && now - paintedAt < 250)) return;
      source = heatmap;
      paintedAt = now;
      heat.width = heatmap.cols;
      heat.height = heatmap.rows;
      const data = heatCtx.createImageData(heatmap.cols, heatmap.rows);
      paintHeatmap(heatmap, data);
      heatCtx.putImageData(data, 0, 0);
      image.setAttribute("width", String(heatmap.cols * HEAT_CELL));
      image.setAttribute("height", String(heatmap.rows * HEAT_CELL));
      image.setAttribute("href", heat.toDataURL());
    };
    update();
    return controller.subscribe(update);
  }, [showHeatmap]);

  const k = 0.52 * scale;
  return (
    <g clipPath={`url(#${clipPathId})`} pointerEvents="none" data-testid="iso-heatmap">
      <image
        ref={imageRef}
        visibility="hidden"
        preserveAspectRatio="none"
        opacity={active ? 0.9 : 0.35}
        transform={`matrix(${scale} ${k} ${-scale} ${k} ${ISO_ORIGIN_X} ${ISO_ORIGIN_Y})`}
      />
    </g>
  );
}
