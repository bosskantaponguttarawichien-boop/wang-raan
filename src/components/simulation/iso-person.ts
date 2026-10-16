/**
 * ตัวคนแบบ chibi สำหรับการจำลองในมุมมอง 3D — วาดด้วย Canvas 2D ล้วน (ไม่มีไฟล์ภาพ)
 * - หน้าตาคงที่ต่อลูกค้าหนึ่งคน (hash จาก id): สีผิว เสื้อ กางเกง และทรงผม/หมวก 6 แบบ
 * - หันได้ 4 ทิศ (หน้า/หลัง × ซ้าย/ขวา) ตามทิศที่เดินบนจอ; ด้านหลังไม่เห็นหน้า
 * - แขนขาแกว่งตามระยะที่เดิน (phase) และท่านั่งเมื่ออยู่ที่เก้าอี้
 * หน่วยทั้งหมดเป็น px ของ viewBox โดยจุด (0, 0) คือพื้นใต้เท้า
 */

export type HairStyle = "short" | "long" | "bald" | "cap" | "bowler" | "bun";
export type Accessory = "none" | "glasses" | "earring" | "collar";

export interface PersonLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hat: string;
  style: HairStyle;
  accessory: Accessory;
}

export interface Facing {
  /** หันเข้าหาผู้ชม (เห็นหน้า) */
  front: boolean;
  /** หันไปทางขวาของจอ */
  right: boolean;
}

/**
 * ท่าทางที่สื่อให้เห็นว่า "คนนี้กำลังทำอะไร" โดยไม่ต้องดูสีวงใต้เท้าอย่างเดียว
 * ค่านี้เป็น presentation state จากรหัสสถานะของ simulation จึงไม่แตะสัญญา Worker
 */
export type PersonBehavior = "walking" | "queueing" | "ordering" | "dining" | "leaving";

/** stateCode ตาม AGENT_STATE_CODE ใน core/simulation/engine.ts */
export function behaviorFromState(state: number): PersonBehavior {
  switch (state) {
    case 1:
      return "queueing";
    case 2:
      return "ordering";
    case 4:
      return "dining";
    case 5:
      return "leaving";
    default:
      return "walking";
  }
}

const SKINS = ["#f6d2b0", "#e9b98f", "#d39a6c", "#a8724a"] as const;
const SHIRTS = ["#d9473a", "#3d6fd6", "#f2efe6", "#e9c46a", "#6aa6d8", "#c8553d", "#7a8b55", "#b04a5a"] as const;
const PANTS = ["#24395f", "#3a3f48", "#9a7550", "#d6c49a", "#c0392b", "#5b6b7d"] as const;
const HAIRS = ["#2b2b2e", "#4a3326", "#d9c08a", "#8a8f99", "#6a3b2a"] as const;
const HATS = ["#2f3238", "#e0703a", "#3a8fd6", "#c94a3a"] as const;
const STYLES: HairStyle[] = ["short", "long", "bald", "cap", "bowler", "bun"];
const ACCESSORIES: Accessory[] = ["none", "glasses", "earring", "collar"];

/** hash จำนวนเต็มแบบกระจายดี (ไม่ต้องสุ่มจริง — ลูกค้าคนเดิมหน้าตาเดิมทุกเฟรม) */
function hash(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function personLook(id: number): PersonLook {
  const h = hash(id);
  const pick = <T>(list: readonly T[], shift: number) => list[(h >>> shift) % list.length]!;
  return {
    skin: pick(SKINS, 0),
    shirt: pick(SHIRTS, 3),
    pants: pick(PANTS, 7),
    hair: pick(HAIRS, 11),
    hat: pick(HATS, 15),
    style: pick(STYLES, 19),
    accessory: pick(ACCESSORIES, 23),
  };
}

/**
 * ทิศที่หันจากการเคลื่อนที่ (เมตร) — ฉายเป็นทิศบนจอก่อน: sx = dx − dy, sy = (dx + dy)·0.52
 * เคลื่อนที่น้อยเกินไปคงทิศเดิม (กันหันกลับไปมา)
 */
export function facingFrom(dx: number, dy: number, previous: Facing): Facing {
  if (Math.hypot(dx, dy) < 1e-3) return previous;
  const sx = dx - dy;
  const sy = (dx + dy) * 0.52;
  return {
    right: Math.abs(sx) < 1e-4 ? previous.right : sx > 0,
    front: Math.abs(sy) < 1e-4 ? previous.front : sy > 0,
  };
}

function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
}

function shade(color: string, amount: number): string {
  const n = parseInt(color.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export interface DrawPersonOptions {
  look: PersonLook;
  facing: Facing;
  behavior: PersonBehavior;
  /** มุมจังหวะเดิน (เรเดียน) — 0 = ยืนตรง */
  phase: number;
  walking: boolean;
  seated: boolean;
  /** สีวงใต้เท้าตามสถานะ (legend เดิม) */
  ring: string;
  /** ขยายทั้งตัว (ตาม scale ของฉาก) */
  size: number;
}

/** วาดตัวคน 1 คนที่จุดพื้น (x, y) ใน viewBox */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, o: DrawPersonOptions) {
  const { look, facing, seated, behavior } = o;
  const swing = o.walking ? Math.sin(o.phase) : 0;
  const bob = o.walking ? Math.abs(Math.cos(o.phase)) * 0.75 : 0;
  const hipY = -11;
  const shoulderY = -21;
  const headY = -32;
  const shoe = "#252936";

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(o.size, o.size);

  // เงานุ่มและวงสถานะ: เพิ่มพื้นที่เล็กน้อยให้ตัวละครที่ตัวใหญ่ขึ้นยังอ่านตำแหน่งได้
  ctx.fillStyle = "rgba(30, 43, 64, 0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.6, 3.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = o.ring;
  ctx.lineWidth = 1.35;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 4.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ทิศซ้าย = กลับด้านแนวนอน (ภาพหลักหันขวา)
  if (!facing.right) ctx.scale(-1, 1);
  ctx.translate(0, -(seated ? 13 : 0) - bob);

  // ขาเป็น capsule หนานุ่ม เพื่อไม่ให้ดูเป็นไม้ขีดเมื่อซูมออก
  if (seated) {
    const dir = facing.front ? 1 : -1;
    for (const off of [-2.1, 2.1]) {
      limb(ctx, off, hipY, off + 5.7, hipY + 2.6 * dir, 4.2, look.pants);
      limb(ctx, off + 5.7, hipY + 2.6 * dir, off + 6.1, hipY + 8.3, 3.8, shade(look.pants, 0.12));
      ctx.fillStyle = shoe;
      ctx.beginPath();
      ctx.ellipse(off + 7, hipY + 8.9, 3.1, 1.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const [off, step] of [[-2.2, -swing], [2.2, swing]] as const) {
      const footX = off + step * 4;
      const footY = Math.min(-0.4, -Math.max(0, -step) * 1.35);
      limb(ctx, off, hipY, footX, footY - 2, 4.25, step < 0 ? shade(look.pants, 0.12) : look.pants);
      ctx.fillStyle = shoe;
      ctx.beginPath();
      ctx.ellipse(footX + 1.1, footY - 0.8, 3.15, 1.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const armSwing = o.walking ? swing * 3.2 : 0;
  const backHand = behavior === "ordering" ? { x: -5.6, y: shoulderY - 1 } : behavior === "dining" ? { x: -4.5, y: shoulderY + 4.2 } : { x: -5.8 - armSwing * 0.3, y: shoulderY + 8 };
  const frontHand = behavior === "queueing" ? { x: 4.4, y: shoulderY + 2.4 } : behavior === "ordering" ? { x: 7.8, y: shoulderY - 7.2 } : behavior === "dining" ? { x: 5.4, y: shoulderY + 1.6 } : { x: 5.9 + armSwing * 0.4, y: shoulderY + 8 };

  // แขนหลังและผมยาววาดก่อนลำตัว ให้มีชั้น depth แบบ soft-toy
  limb(ctx, -4.7, shoulderY + 1, backHand.x, backHand.y, 3.65, shade(look.shirt, 0.16));
  if (look.style === "long") {
    ctx.fillStyle = look.hair;
    roundedRect(ctx, -7, headY - 2, 14, 13.5, 5.2);
    ctx.fill();
  }

  // ลำตัว: แสงด้านซ้าย + ชายเสื้อกลม ทำให้ดูเป็น volume แทนกล่องสี่เหลี่ยม
  const body = ctx.createLinearGradient(-6, shoulderY, 6, hipY);
  body.addColorStop(0, shade(look.shirt, -0.08));
  body.addColorStop(0.55, look.shirt);
  body.addColorStop(1, shade(look.shirt, 0.18));
  ctx.fillStyle = body;
  roundedRect(ctx, -6.1, shoulderY - 1.5, 12.2, 12.8, 4.8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.ellipse(-2.6, shoulderY + 1.2, 2.1, 4.4, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(look.pants, 0.08);
  roundedRect(ctx, -5.4, hipY - 1.4, 10.8, 2.5, 1.2);
  ctx.fill();

  // แขนหน้าและมือเป็นทรงกลม ช่วยให้ silhouette คมเมื่อแสดงตัวเล็ก
  limb(ctx, 4.7, shoulderY + 1, frontHand.x, frontHand.y, 3.7, look.shirt);
  for (const hand of [backHand, frontHand]) {
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y + 0.8, 1.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // props ของพฤติกรรม ยังคงอยู่ แต่จัดสัดส่วนให้กลมกลืนกับตัวละครใหม่
  if (behavior === "queueing") {
    ctx.save();
    ctx.translate(3.9, shoulderY + 2.8);
    ctx.rotate(0.22);
    ctx.fillStyle = "#222c40";
    roundedRect(ctx, -1.75, -2.7, 3.5, 5.4, 0.75);
    ctx.fill();
    ctx.fillStyle = "#b9e4ff";
    roundedRect(ctx, -1.12, -1.85, 2.24, 3.35, 0.4);
    ctx.fill();
    ctx.restore();
  }
  if (behavior === "ordering") {
    ctx.save();
    ctx.translate(8.5, shoulderY - 7.4);
    ctx.rotate(0.14);
    ctx.fillStyle = "#fffdf8";
    roundedRect(ctx, -2.65, -3.25, 5.3, 6.5, 0.65);
    ctx.fill();
    ctx.strokeStyle = "#d5dde8";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.strokeStyle = "#e0703a";
    ctx.beginPath();
    ctx.moveTo(-1.4, -0.9);
    ctx.lineTo(1.4, -0.9);
    ctx.moveTo(-1.4, 0.75);
    ctx.lineTo(0.85, 0.75);
    ctx.stroke();
    ctx.restore();
  }
  if (behavior === "dining") {
    ctx.fillStyle = "#5cc0e5";
    roundedRect(ctx, 4.75, shoulderY - 0.7, 3.35, 4.05, 0.95);
    ctx.fill();
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(6.4, shoulderY - 1.8);
    ctx.lineTo(7.7, shoulderY - 4.8);
    ctx.stroke();
  }
  if (behavior === "leaving") {
    ctx.fillStyle = "#c87847";
    roundedRect(ctx, -8.7, hipY - 0.5, 4.8, 5.7, 1.25);
    ctx.fill();
    ctx.strokeStyle = "#92522c";
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(-6.3, hipY - 0.5, 1.6, Math.PI, 0);
    ctx.stroke();
  }

  // คอและหัวรูปไข่: สัดส่วนใหญ่ขึ้นเล็กน้อยให้เห็นบุคลิกจากมุมกว้าง
  ctx.fillStyle = shade(look.skin, 0.04);
  roundedRect(ctx, -2.35, headY + 5.6, 4.7, 4.6, 1.9);
  ctx.fill();
  const head = ctx.createRadialGradient(-2.1, headY - 3.4, 0.6, 0, headY, 8.3);
  head.addColorStop(0, shade(look.skin, -0.13));
  head.addColorStop(0.68, look.skin);
  head.addColorStop(1, shade(look.skin, 0.13));
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(0, headY, 7.1, 7.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(look.skin, 0.12);
  ctx.beginPath();
  ctx.ellipse(-7.05, headY + 0.8, 1.1, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // หน้าแบบละเอียดพอดีสำหรับ scale นี้ — เมื่อหันหลังจะเหลือ silhouette และทรงผม
  if (facing.front) {
    ctx.fillStyle = "#29354d";
    for (const ex of [1.4, 4.15]) {
      ctx.beginPath();
      ctx.arc(ex, headY + 0.35, 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(143, 72, 75, 0.65)";
    ctx.lineWidth = 0.72;
    ctx.beginPath();
    ctx.arc(3, headY + 3.2, 1.45, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = "rgba(222, 104, 111, 0.26)";
    ctx.beginPath();
    ctx.ellipse(5.2, headY + 2.15, 1.45, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    if (look.accessory === "glasses") {
      ctx.strokeStyle = "#3c4658";
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.arc(1.4, headY + 0.35, 1.85, 0, Math.PI * 2);
      ctx.arc(4.15, headY + 0.35, 1.85, 0, Math.PI * 2);
      ctx.moveTo(3.2, headY + 0.35);
      ctx.lineTo(2.35, headY + 0.35);
      ctx.stroke();
    }
  }

  // ทรงผม/หมวกเป็น layer สุดท้าย ให้สีและ volume ของศีรษะอ่านง่ายในมุม isometric
  ctx.fillStyle = look.hair;
  const topCap = (from: number, to: number) => {
    ctx.beginPath();
    ctx.ellipse(0, headY, 7.45, 8.2, 0, from, to);
    ctx.closePath();
    ctx.fill();
  };
  switch (look.style) {
    case "short":
    case "long":
    case "bun":
      if (facing.front) topCap(Math.PI * 0.92, Math.PI * 2.08);
      else topCap(Math.PI * 0.6, Math.PI * 2.36);
      if (look.style === "bun") {
        ctx.beginPath();
        ctx.arc(-2.2, headY - 8.2, 2.85, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "bald":
      ctx.beginPath();
      ctx.arc(-3.3, headY + 0.75, 2.8, Math.PI * 0.45, Math.PI * 1.55);
      ctx.fill();
      if (!facing.front) topCap(Math.PI * 0.72, Math.PI * 1.14);
      break;
    case "cap":
      ctx.fillStyle = look.hat;
      topCap(Math.PI, Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(facing.front ? 5.2 : -5.2, headY - 0.85, 5.1, 1.65, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bowler":
      ctx.fillStyle = look.hat;
      ctx.beginPath();
      ctx.ellipse(0, headY - 3.2, 9.5, 2.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, headY - 3.5, 5.8, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
  }

  if (look.accessory === "earring" && facing.front) {
    ctx.fillStyle = "#f1bd4d";
    ctx.beginPath();
    ctx.arc(6.7, headY + 2.4, 1.05, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.accessory === "collar") {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.moveTo(-3.2, shoulderY - 1.4);
    ctx.lineTo(0, shoulderY + 2.2);
    ctx.lineTo(3.2, shoulderY - 1.4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
