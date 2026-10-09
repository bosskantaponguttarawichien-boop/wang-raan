"use client";

/**
 * Canvas Simulation Overlay — ทับบน Artboard 2D (architecture.md §5.3.3)
 * - Worker ส่งตำแหน่ง ~20 ครั้ง/วินาที; overlay interpolate ระหว่าง 2 tick ด้วย requestAnimationFrame → 60 FPS
 * - ไม่ re-render React ระหว่างเล่น: วาดลง <canvas> โดยตรง
 * - Canvas ปรับตาม devicePixelRatio จึงคมชัดบน Retina
 * - prefers-reduced-motion: ไม่ interpolate และวาดใหม่ไม่เกินวินาทีละครั้ง (ภาพเปลี่ยนเป็นจังหวะ ไม่เคลื่อนไหวต่อเนื่อง)
 */
import * as React from "react";
import { AGENT_STRIDE } from "@/core/simulation";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getSimulationController, type HeatmapFrame, type SimulationFrame } from "./simulation-controller";

/** สีจุดลูกค้าตาม stateCode (engine.AGENT_STATE_CODE) */
export const AGENT_COLORS = ["#3b62f4", "#a87410", "#1e2b40", "#3b62f4", "#2e9b78", "#66758a"] as const;
export const AGENT_LEGEND = [
  { label: "เดินเข้า / ไปที่นั่ง", color: AGENT_COLORS[0] },
  { label: "รอคิว", color: AGENT_COLORS[1] },
  { label: "สั่งที่เคาน์เตอร์", color: AGENT_COLORS[2] },
  { label: "นั่งทาน", color: AGENT_COLORS[4] },
  { label: "เดินออก", color: AGENT_COLORS[5] },
] as const;

const TICK_MS = 50;

/** ระบายสี heatmap ลงภาพขนาด cols × rows (ฟ้า → แดงอมส้ม ตามความหนาแน่น) */
export function paintHeatmap(frame: HeatmapFrame, image: ImageData) {
  const { values, max } = frame;
  const data = image.data;
  for (let i = 0; i < values.length; i++) {
    const v = max > 0 ? Math.sqrt(values[i]! / max) : 0;
    const o = i * 4;
    if (v < 0.03) {
      data[o + 3] = 0;
      continue;
    }
    data[o] = Math.round(59 + (228 - 59) * v);
    data[o + 1] = Math.round(98 + (104 - 98) * v);
    data[o + 2] = Math.round(244 + (93 - 244) * v);
    data[o + 3] = Math.round(40 + 120 * v);
  }
}

/** ตำแหน่งลูกค้าที่ interpolate แล้ว: [x, y, stateCode] ต่อคน */
export function interpolateAgents(
  previous: SimulationFrame | null,
  current: SimulationFrame | null,
  t: number,
): Array<[number, number, number]> {
  if (!current) return [];
  const before = new Map<number, [number, number]>();
  if (previous) {
    for (let o = 0; o < previous.agents.length; o += AGENT_STRIDE) {
      before.set(previous.agents[o]!, [previous.agents[o + 1]!, previous.agents[o + 2]!]);
    }
  }
  const out: Array<[number, number, number]> = [];
  for (let o = 0; o < current.agents.length; o += AGENT_STRIDE) {
    const id = current.agents[o]!;
    const x = current.agents[o + 1]!;
    const y = current.agents[o + 2]!;
    const p = before.get(id);
    // กระโดดไกล (เช่นลุกจากเก้าอี้) ไม่ interpolate
    if (p && Math.hypot(x - p[0], y - p[1]) < 1) out.push([p[0] + (x - p[0]) * t, p[1] + (y - p[1]) * t, current.agents[o + 3]!]);
    else out.push([x, y, current.agents[o + 3]!]);
  }
  return out;
}

export function SimulationOverlay({ width, depth }: { width: number; depth: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const status = useSimulationStore((s) => s.status);
  const active = status === "running" || status === "paused";

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const controller = getSimulationController();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const heat = document.createElement("canvas");
    const heatCtx = heat.getContext("2d");
    let heatSource: HeatmapFrame | null = null;
    let frame = 0;
    let lastDraw = -Infinity;
    let dirty = true;
    const frameTimes: number[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    resize();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      // วัด FPS เฉลี่ย 60 เฟรมล่าสุด (ใช้ตรวจ gate 60 FPS)
      frameTimes.push(now);
      if (frameTimes.length > 61) frameTimes.shift();
      if (frameTimes.length > 10) canvas.dataset.fps = (((frameTimes.length - 1) * 1000) / (now - frameTimes[0]!)).toFixed(1);

      if (reduceMotion && (!dirty || now - lastDraw < 1000)) return;
      dirty = false;
      lastDraw = now;

      const { previous, current, heatmap } = controller;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (heatmap && heatCtx) {
        if (heatSource !== heatmap) {
          heatSource = heatmap;
          heat.width = heatmap.cols;
          heat.height = heatmap.rows;
          const image = heatCtx.createImageData(heatmap.cols, heatmap.rows);
          paintHeatmap(heatmap, image);
          heatCtx.putImageData(image, 0, 0);
        }
        ctx.imageSmoothingEnabled = true;
        // ช่องสุดท้ายอาจยื่นเลยขอบร้าน (ขนาดร้านไม่ลงตัว 0.25) จึงวาดตามขนาดกริดจริง
        const cell = 0.25;
        ctx.drawImage(heat, 0, 0, ((heatmap.cols * cell) / width) * canvas.width, ((heatmap.rows * cell) / depth) * canvas.height);
      }

      const t = reduceMotion || !current ? 1 : Math.min(1, (now - current.at) / TICK_MS);
      const sx = canvas.width / width;
      const sy = canvas.height / depth;
      const radius = Math.max(3 * (window.devicePixelRatio || 1), 0.14 * sx);
      for (const [x, y, state] of interpolateAgents(previous, current, t)) {
        ctx.beginPath();
        ctx.arc(x * sx, y * sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = AGENT_COLORS[state] ?? AGENT_COLORS[0];
        ctx.globalAlpha = state === 4 ? 0.75 : 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = Math.max(1, radius * 0.3);
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
    };
    frame = requestAnimationFrame(draw);
    const unsubscribe = controller.subscribe(() => {
      dirty = true; // มีเฟรมใหม่ (reduced motion: วาดได้ไม่เกินวินาทีละครั้ง)
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      unsubscribe();
    };
  }, [width, depth]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="simulation-overlay"
      data-active={active}
      className="pointer-events-none absolute inset-0 z-[30] h-full w-full"
    />
  );
}
