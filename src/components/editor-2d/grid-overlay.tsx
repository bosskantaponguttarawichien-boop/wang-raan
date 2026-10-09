import { GRID_STEP, type Meters } from "@/core/layout";

/**
 * เส้นกริด SVG — vector-effect: non-scaling-stroke ทำให้เส้นหนา 1px คมชัดทุก DPR (Retina / 4K)
 * แม้ viewBox เป็นหน่วยเมตรและยืดตามขนาดจอ; กริดย่อย 0.25 ม. และกริดหลัก 1 ม. (design-system §2.3)
 */
export function GridOverlay({ width, depth }: { width: Meters; depth: Meters }) {
  const minor: string[] = [];
  const major: string[] = [];
  const steps = (length: Meters) => Math.round(length / GRID_STEP);
  for (let i = 1; i < steps(width); i++) {
    const x = i * GRID_STEP;
    (i % 4 === 0 ? major : minor).push(`M${x} 0V${depth}`);
  }
  for (let j = 1; j < steps(depth); j++) {
    const y = j * GRID_STEP;
    (j % 4 === 0 ? major : minor).push(`M0 ${y}H${width}`);
  }
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${depth}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      data-testid="grid-overlay"
    >
      <path d={minor.join("")} stroke="var(--plan-grid-minor)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
      <path d={major.join("")} stroke="var(--plan-grid-major)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}
