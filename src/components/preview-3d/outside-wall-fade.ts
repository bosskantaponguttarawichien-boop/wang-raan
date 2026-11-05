import type { WallDoor } from "@/core/layout";

/**
 * ผนังโปร่งเมื่อมีคนอยู่ด้านนอก (feat-166) — แถวรอคิวนอกร้านอยู่หลังผนังด้านไกลกล้อง จึงเห็นแค่หัว
 * ผนังด้านที่มีลูกค้ายืน/เดินอยู่ด้านนอกค่อย ๆ จางเหลือ OUTSIDE_WALL_OPACITY แล้วกลับทึบเมื่อไม่มีใคร
 * เป็นตัวคูณซ้อนกับความทึบตามมุมกล้อง (ผนังด้านใกล้กล้องซ่อนอยู่แล้วก็ยังซ่อน)
 */
export type Wall = WallDoor["wall"];

export const OUTSIDE_WALL_OPACITY = 0.35;
/** จาง/กลับทึบเต็มช่วงในเวลานี้ (วินาทีจริง) */
export const OUTSIDE_FADE_SECONDS = 0.4;

const WALLS: readonly Wall[] = ["north", "south", "west", "east"];

/** ผนังที่มีตัวละครอยู่ด้านนอก — north = y < 0, south = y > depth, west = x < 0, east = x > width */
export function wallsWithPeopleOutside(agents: Float32Array, size: { width: number; depth: number }): Set<Wall> {
  const out = new Set<Wall>();
  for (let offset = 0; offset < agents.length; offset += 4) {
    const x = agents[offset + 1]!, y = agents[offset + 2]!;
    if (y < 0) out.add("north");
    if (y > size.depth) out.add("south");
    if (x < 0) out.add("west");
    if (x > size.width) out.add("east");
  }
  return out;
}

export class OutsideWallFade {
  private readonly factors = new Map<Wall, number>();

  /** ตัวคูณความทึบของผนังด้านนี้ (1 = ทึบตามปกติ) */
  factor(wall: Wall): number {
    return this.factors.get(wall) ?? 1;
  }

  reset() {
    this.factors.clear();
  }

  /** เดินความจางหนึ่งเฟรม — คืน true เมื่อค่าเปลี่ยน (ต้องวาดผนังใหม่) */
  update(outside: ReadonlySet<Wall>, dt: number, reducedMotion: boolean): boolean {
    let changed = false;
    const step = Math.max(0, dt) * (1 - OUTSIDE_WALL_OPACITY) / OUTSIDE_FADE_SECONDS;
    for (const wall of WALLS) {
      const current = this.factor(wall);
      const target = outside.has(wall) ? OUTSIDE_WALL_OPACITY : 1;
      const next = reducedMotion ? target : current + Math.max(-step, Math.min(step, target - current));
      if (next === current) continue;
      this.factors.set(wall, next);
      changed = true;
    }
    return changed;
  }
}
