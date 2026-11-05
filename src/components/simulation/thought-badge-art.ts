import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";

/**
 * Illustrated status badges (design reference: 6 pastel map pins, 2026-11-05).
 * One set of SVG paths feeds the WebGL overlay, the React bubble and the canvas
 * fallback, so the three renderers cannot drift apart again.
 * Coordinates use a 100 × 112 box; the round head is centred on (50, 50).
 */
export const BADGE_VIEWBOX_WIDTH = 100;
export const BADGE_VIEWBOX_HEIGHT = 112;
export const BADGE_ASPECT = BADGE_VIEWBOX_HEIGHT / BADGE_VIEWBOX_WIDTH;

/** Round head with a short pin tip; the rim stroke uses a round join so the tip stays soft. */
const PIN = "M50 108C45.5 104 29.6 92.4 21.7 86.3A46 46 0 1 1 78.3 86.3C70.4 92.4 54.5 104 50 108Z";
const RIM_WIDTH = 5;
/** Illustration size inside the pin, scaled around the head centre (50, 50); the pin itself is unchanged. */
export const ICON_SCALE = 0.75;
const ICON_OFFSET = 50 * (1 - ICON_SCALE);

export interface ThoughtBadgeTheme {
  fill: string;
  /** Warm rim keeps the marker separate from the pale isometric floor. */
  rim: string;
}

const RIM = "#f8f0e2";
const CREAM = "#fff9ef";
const INK = "#4a4446";
const ORANGE = "#f58a33";
const ORANGE_DARK = "#e2702a";

export type BadgeArt = "queue" | "order" | "food" | "eating" | "bill" | "leaving" | "cleaning" | "resting";

/**
 * The marker colour describes the current service step, not urgency. Urgency
 * stays in the label/tooltip so the scene does not turn red/yellow as soon as
 * several guests wait at once.
 */
const THEMES: Record<BadgeArt, ThoughtBadgeTheme> = {
  queue: { fill: "#8fb3d1", rim: RIM },
  order: { fill: "#d68d85", rim: RIM },
  food: { fill: "#d2b865", rim: RIM },
  eating: { fill: "#93b996", rim: RIM },
  bill: { fill: "#aa9dca", rim: RIM },
  leaving: { fill: "#dba27f", rim: RIM },
  cleaning: { fill: "#93b996", rim: RIM },
  // Not part of the six-pin design; kept neutral so it is not mistaken for "leaving".
  resting: { fill: "#b9ada3", rim: RIM },
};

export function badgeArtFor(thought: CustomerThought | StaffThought): BadgeArt {
  switch (thought.kind) {
    case "queue-wait":
    case "queue-warning":
    case "queue-critical":
      return "queue";
    case "order-wait":
    case "taking-order":
      return "order";
    case "food-wait":
    case "food-warning":
    case "food-critical":
    case "serving":
      return "food";
    case "eating":
      return "eating";
    case "bill-wait":
    case "taking-payment":
      return "bill";
    case "leaving":
      return "leaving";
    case "cleaning":
      return "cleaning";
    case "resting":
      return "resting";
  }
}

export function getThoughtBadgeTheme(thought: CustomerThought | StaffThought): ThoughtBadgeTheme {
  return THEMES[badgeArtFor(thought)];
}

interface Shape {
  readonly d: string;
  readonly fill?: string;
  readonly stroke?: string;
  readonly width?: number;
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  r <= 0
    ? `M${x} ${y}h${w}v${h}h${-w}Z`
    : `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const line = (d: string, stroke: string, width = 4): Shape => ({ d, stroke, width });
const fill = (d: string, color: string): Shape => ({ d, fill: color });
/** Three short "attention" rays above an icon, as drawn in the design. */
const rays = (cx: number, top: number): Shape => line(`M${cx} ${top}v8M${cx - 13} ${top + 4}l4 6M${cx + 13} ${top + 4}l-4 6`, CREAM, 4);

function chair(backX: number, seatX: number, y: number): Shape[] {
  return [
    fill(rect(backX, y, 10, 23, 3), ORANGE),
    fill(rect(seatX, y + 19, 24, 7, 2.5), CREAM),
    fill(rect(seatX, y + 24, 24, 4, 2), ORANGE_DARK),
    line(`M${seatX + 3} ${y + 29}v11M${seatX + 21} ${y + 29}v11`, INK, 3.5),
  ];
}

const coin = (y: number): Shape[] => [
  fill(ellipse(64, y + 6, 13, 5), "#d98a22"),
  fill(rect(51, y, 26, 6), "#d98a22"),
  fill(ellipse(64, y, 13, 5), "#ffc94d"),
];

const ART: Record<BadgeArt, readonly Shape[]> = {
  queue: [rays(50, 17), ...chair(23, 23, 36), ...chair(67, 53, 36)],
  order: [
    fill(rect(30, 25, 34, 47, 5), CREAM),
    line(rect(30, 25, 34, 47, 5), INK, 4),
    fill(rect(40, 20, 14, 9, 3), INK),
    fill(circle(47, 19, 4), INK),
    fill(circle(39, 39, 3), "#e9625b"),
    fill(circle(39, 50, 3), "#e9625b"),
    fill(circle(39, 61, 3), "#e9625b"),
    line("M45 39h12M45 50h12M45 61h8", "#857b79", 4),
    { d: "M58 73 74 53 80 58 64 78 56 80Z", fill: ORANGE, stroke: CREAM, width: 3 },
  ],
  food: [
    line("M38 34c-4-4 4-7 0-12M50 32c-4-4 4-7 0-12M62 34c-4-4 4-7 0-12", CREAM, 4),
    fill(circle(50, 42, 4), CREAM),
    fill("M26 68C26 54 37 45 50 45S74 54 74 68Z", CREAM),
    line("M20 71H80", "#6f6866", 5),
  ],
  eating: [
    rays(50, 19),
    line("M24 38v10a4 4 0 0 0 8 0v-10M28 38v34", CREAM, 3.5),
    fill(circle(50, 55, 18), CREAM),
    fill(circle(50, 55, 13.5), "#f1e4d2"),
    fill(ellipse(47, 59, 10, 6), "#7a4a2e"),
    fill(circle(45, 49, 5), "#5d9b4b"),
    fill(circle(51, 47, 5), "#5d9b4b"),
    fill(circle(57, 56, 5), "#ef6a4f"),
    line("M74 38v34", CREAM, 4),
    fill("M74 36c7 4 7 17 0 21Z", CREAM),
  ],
  bill: [
    fill(rect(22, 28, 44, 30, 5), CREAM),
    fill(rect(22, 35, 44, 6), "#4f4851"),
    fill(rect(28, 46, 10, 6, 2), "#f6c445"),
    ...coin(64),
    ...coin(57),
    ...coin(50),
  ],
  leaving: [
    fill("M30 28 46 34V80L30 76Z", "#f6ecdf"),
    line("M30 76V28a3 3 0 0 1 3-3h21a3 3 0 0 1 3 3v48", INK, 5),
    fill(circle(41, 56, 2.5), INK),
    { d: "M50 54h13v-7l12 11-12 11v-7H50Z", fill: "#f47c5a", stroke: CREAM, width: 3 },
    line("M70 33l-3 6M78 40l-6 3", CREAM, 3.5),
  ],
  cleaning: [
    fill("M40 26h16l4 7H38Z", "#6d5544"),
    fill(rect(41, 33, 10, 9), "#6d5544"),
    fill(rect(34, 41, 24, 36, 5), CREAM),
    fill(rect(34, 55, 24, 8), "#79b08a"),
    line("M66 30l6-3M67 38h8M66 46l6 3", CREAM, 3.5),
  ],
  resting: [
    line("M40 36c-4-4 4-7 0-12M52 36c-4-4 4-7 0-12", CREAM, 4),
    fill("M28 44h34v13a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14Z", CREAM),
    line("M62 48h4a7 7 0 0 1 0 14h-5", CREAM, 4.5),
    line("M22 77h48", "#7d7068", 4.5),
  ],
};

function shapeSvg(shape: Shape) {
  const stroke = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 4}"` : "";
  return `<path d="${shape.d}" fill="${shape.fill ?? "none"}"${stroke}/>`;
}

/** Complete badge (rim, coloured pin and illustration) as an inline SVG string. */
export function thoughtBadgeSvg(thought: CustomerThought | StaffThought, width: number): string {
  const art = badgeArtFor(thought);
  const theme = THEMES[art];
  const height = Math.round(width * BADGE_ASPECT * 100) / 100;
  return `<svg viewBox="0 0 ${BADGE_VIEWBOX_WIDTH} ${BADGE_VIEWBOX_HEIGHT}" width="${width}" height="${height}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-badge-art="${art}">`
    + `<path d="${PIN}" fill="${theme.fill}" stroke="${theme.rim}" stroke-width="${RIM_WIDTH}"/>`
    + `<g transform="matrix(${ICON_SCALE} 0 0 ${ICON_SCALE} ${ICON_OFFSET} ${ICON_OFFSET})">`
    + ART[art].map(shapeSvg).join("")
    + "</g></svg>";
}

/**
 * Canvas fallback: draws the same badge with its tip at (tipX, tipY).
 * Without Path2D (old browsers, jsdom) a plain coloured dot keeps the status visible.
 */
export function drawThoughtBadgeArt(ctx: CanvasRenderingContext2D, thought: CustomerThought | StaffThought, tipX: number, tipY: number, width: number) {
  const art = badgeArtFor(thought);
  const theme = THEMES[art];
  const scale = width / BADGE_VIEWBOX_WIDTH;
  ctx.save();
  if (typeof Path2D !== "function") {
    ctx.fillStyle = theme.fill;
    ctx.strokeStyle = theme.rim;
    ctx.lineWidth = Math.max(1, RIM_WIDTH * scale);
    ctx.beginPath();
    ctx.arc(tipX, tipY - width * 0.66, width * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.translate(tipX - width / 2, tipY - BADGE_VIEWBOX_HEIGHT * scale);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pin = new Path2D(PIN);
  ctx.fillStyle = theme.fill;
  ctx.fill(pin);
  ctx.strokeStyle = theme.rim;
  ctx.lineWidth = RIM_WIDTH;
  ctx.stroke(pin);
  ctx.translate(ICON_OFFSET, ICON_OFFSET);
  ctx.scale(ICON_SCALE, ICON_SCALE);
  for (const shape of ART[art]) {
    const path = new Path2D(shape.d);
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill(path);
    }
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.width ?? 4;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}
