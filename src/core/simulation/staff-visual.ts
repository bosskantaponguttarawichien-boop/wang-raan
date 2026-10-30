/**
 * ภาพพนักงานหน้าร้าน (table-service) — Pure TypeScript
 * engine คิดงานพนักงานเป็น "เวลางาน" (รับออร์เดอร์ = เดินไป + คุย + เดินกลับ ฯลฯ) จากระยะบนผัง
 * ไฟล์นี้แปลงงานเดียวกันเป็นเส้นทางเดินจริงบนกริด แล้วแบ่งเวลางานเดิมลงแต่ละช่วง — ไม่สุ่มเพิ่ม ไม่เปลี่ยนเวลา
 * ผลจำลองจึงเท่าเดิม และใช้เฉพาะตอนเล่นภาพ (การวิเคราะห์ทั้งวันไม่สร้าง)
 * - พนักงานยืนประจำหลังเคาน์เตอร์ (staffSpots) — คนเกินจำนวนจุดยืนข้างเคาน์เตอร์
 * - เดินบนกริดที่ไม่กันจุดยืนพนักงาน (กันเฉพาะวัตถุ) จึงเดินออกจากหลังเคาน์เตอร์ได้
 * - จุดบนเส้นทางถูกดึงให้ห่างผนัง WALL_CLEARANCE ถ้ายังเป็นช่องว่าง จึงไม่เดินซ้อนผนัง (จุดยืนประจำไม่ขยับ)
 */
import { footprint } from "../layout/geometry";
import type { Meters, Point, Rect, StoreLayout } from "../layout/types";
import { staffSpots } from "../preview/staff-spots";
import { computeFlowField, type FlowField } from "./flow-field";
import { CELL_FREE, buildOccupancyGrid, type OccupancyGrid } from "./occupancy-grid";
import type { StaffActivity } from "./presentation-contract";

/** รหัสสถานะพนักงานใน buffer ที่ส่งข้าม thread */
export const STAFF_STATE_CODE = {
  /** อยู่ที่เคาน์เตอร์ (ว่าง หรือรับเงิน) */
  counter: 0,
  walking: 1,
  "taking-order": 2,
  /** ถืออาหารจากประตูครัวไปโต๊ะ */
  serving: 3,
  cleaning: 4,
} as const;

/** ค่าต่อพนักงานใน buffer: index, x, y, stateCode */
export const STAFF_STRIDE = 4;
/** Shared physical speed for visual paths and the engine's travel budget. */
export const STAFF_VISUAL_WALK_SPEED = 1.2;

/**
 * กลางตัวพนักงานห่างผนังร้านอย่างน้อยเท่านี้ (ม.) ตอนเดิน — ไหล่กว้างราว 0.46 ม. และผนังล้ำเข้ามา 0.07 ม.
 * จึงไม่เดินจมผนัง; ยังอยู่ในช่องกริดแถวที่สอง (0.25–0.50 ม.) ที่ตรวจแล้วว่าว่าง
 */
export const WALL_CLEARANCE: Meters = 0.35;

export type StaffTaskKind = "deliver" | "pay" | "clean" | "take-order";

interface Phase {
  /** เส้นทาง (จุดเดียว = ยืนอยู่กับที่) */
  points: Point[];
  length: number;
  seconds: number;
  code: number;
  activity?: StaffActivity;
}

export interface StaffPlan {
  phases: Phase[];
  total: number;
}

export interface StaffSample {
  x: number;
  y: number;
  code: number;
}

function polylineLength(points: Point[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return length;
}

/** ช่องว่างที่ติดขอบสี่เหลี่ยม (รวมแนวทแยง) */
function cellsAround(grid: OccupancyGrid, rect: Rect): number[] {
  const s = grid.cellSize;
  const c0 = Math.max(0, Math.floor(rect.x / s + 1e-9) - 1);
  const c1 = Math.min(grid.cols - 1, Math.ceil((rect.x + rect.width) / s - 1e-9));
  const r0 = Math.max(0, Math.floor(rect.y / s + 1e-9) - 1);
  const r1 = Math.min(grid.rows - 1, Math.ceil((rect.y + rect.depth) / s - 1e-9));
  const out: number[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const index = row * grid.cols + col;
      if (grid.cells[index] === CELL_FREE) out.push(index);
    }
  }
  return out;
}

export class StaffVisuals {
  /** จุดยืนประจำของพนักงานแต่ละคน */
  readonly homes: Point[];
  private readonly grid: OccupancyGrid;
  private readonly kitchenField: FlowField;
  private readonly homeFields = new Map<number, FlowField>();
  private readonly tableRects = new Map<string, Rect>();
  private readonly room: { width: Meters; depth: Meters };

  constructor(layout: StoreLayout, workers: number) {
    this.room = { width: layout.width, depth: layout.depth };
    this.grid = buildOccupancyGrid(layout, undefined, { blockStaffSpots: false });
    this.kitchenField = computeFlowField(this.grid, this.grid.kitchenCells);
    for (const o of layout.objects) if (o.type === "table") this.tableRects.set(o.id, footprint(o));
    this.homes = this.placeHomes(layout, workers);
  }

  private cellOf(p: Point) {
    const s = this.grid.cellSize;
    const col = Math.min(this.grid.cols - 1, Math.max(0, Math.floor(p.x / s)));
    const row = Math.min(this.grid.rows - 1, Math.max(0, Math.floor(p.y / s)));
    return row * this.grid.cols + col;
  }

  private center(cell: number): Point {
    const s = this.grid.cellSize;
    const col = cell % this.grid.cols;
    return { x: (col + 0.5) * s, y: ((cell - col) / this.grid.cols + 0.5) * s };
  }

  /** จุดเดียวกันแต่ห่างผนังอย่างน้อย WALL_CLEARANCE — ขยับแล้วช่องไม่ว่างก็คงจุดเดิม */
  private offWall(p: Point): Point {
    const clamp = (value: number, size: Meters) =>
      Math.min(Math.max(value, WALL_CLEARANCE), Math.max(WALL_CLEARANCE, size - WALL_CLEARANCE));
    const moved = { x: clamp(p.x, this.room.width), y: clamp(p.y, this.room.depth) };
    if (moved.x === p.x && moved.y === p.y) return p;
    return this.grid.cells[this.cellOf(moved)] === CELL_FREE ? moved : p;
  }

  /** จุดยืนหลังเคาน์เตอร์ก่อน คนที่เกินยืนช่องว่างรอบเคาน์เตอร์ (ห่างกันอย่างน้อย 0.5 ม.) */
  private placeHomes(layout: StoreLayout, workers: number): Point[] {
    const homes = staffSpots(layout).map((spot) => spot.position);
    const counters = layout.objects.filter((o) => o.type === "counter").map(footprint);
    const spare = counters.flatMap((rect) => cellsAround(this.grid, rect)).map((cell) => this.center(cell));
    const anchor = homes[0] ?? spare[0] ?? this.center(this.grid.kitchenCells[0] ?? 0);
    spare.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y));
    for (const p of spare) {
      if (homes.length >= workers) break;
      if (homes.every((h) => Math.hypot(h.x - p.x, h.y - p.y) >= 0.5)) homes.push(p);
    }
    while (homes.length < workers) homes.push(homes[homes.length % Math.max(1, homes.length)] ?? anchor);
    return homes.slice(0, workers);
  }

  private homeField(worker: number): FlowField {
    let field = this.homeFields.get(worker);
    if (!field) {
      let cell = this.cellOf(this.homes[worker]!);
      if (this.grid.cells[cell] !== CELL_FREE) {
        // จุดยืนชิดวัตถุจนช่องไม่ว่าง → ใช้ช่องว่างที่ใกล้ที่สุด
        const home = this.homes[worker]!;
        let best = Infinity;
        for (let i = 0; i < this.grid.cells.length; i++) {
          if (this.grid.cells[i] !== CELL_FREE) continue;
          const c = this.center(i);
          const d = Math.hypot(c.x - home.x, c.y - home.y);
          if (d < best) [best, cell] = [d, i];
        }
      }
      field = computeFlowField(this.grid, [cell]);
      this.homeFields.set(worker, field);
    }
    return field;
  }

  /** ช่องตามทางเดินจาก `from` ถึงเป้าหมายของ field (ไปไม่ถึง = []) */
  private trace(field: FlowField, from: number): Point[] {
    if (!Number.isFinite(field.distance[from]!)) return [];
    const points = [this.offWall(this.center(from))];
    let cell = from;
    for (let guard = 0; guard < this.grid.cells.length && field.distance[cell] !== 0; guard++) {
      cell = field.next[cell]!;
      if (cell < 0) break;
      points.push(this.offWall(this.center(cell)));
    }
    return points;
  }

  /** ช่องข้างโต๊ะที่พนักงานคนนี้เดินไปถึงใกล้สุด */
  private standCell(worker: number, tableId: string | null): number | null {
    const rect = tableId ? this.tableRects.get(tableId) : undefined;
    if (!rect) return null;
    const field = this.homeField(worker);
    let best: number | null = null;
    for (const cell of cellsAround(this.grid, rect)) {
      if (Number.isFinite(field.distance[cell]!) && (best === null || field.distance[cell]! < field.distance[best]!)) best = cell;
    }
    return best;
  }

  private toHome(worker: number, from: number): Point[] {
    const path = this.trace(this.homeField(worker), from);
    return path.length > 0 ? [...path, this.homes[worker]!] : [];
  }

  /**
   * แผนเดินของงานหนึ่งงาน: เวลารวม `total` เท่ากับเวลางานใน engine; `walkSeconds` คือส่วนที่เป็นการเดิน
   * (แบ่งตามความยาวแต่ละช่วง) ที่เหลือเป็นเวลายืนทำงานที่โต๊ะ/เคาน์เตอร์
   */
  plan(worker: number, kind: StaffTaskKind, tableId: string | null, total: number, walkSeconds: number): StaffPlan {
    if (!Number.isFinite(total) || !Number.isFinite(walkSeconds) || total < 0 || walkSeconds < 0) throw new RangeError("Invalid staff task duration");
    const home = this.homes[worker]!;
    const stand = kind === "pay" ? null : this.standCell(worker, tableId);
    const still = (seconds: number, code: number, at: Point = home): Phase => ({ points: [at], length: 0, seconds, code });
    if (stand === null) return { phases: [still(total, STAFF_STATE_CODE.counter)], total };

    const back = this.toHome(worker, stand);
    const out = [...back].reverse();
    const at = this.offWall(this.center(stand));
    let legs: { points: Point[]; code: number }[];
    let work: Phase | null = null;
    if (kind === "deliver") {
      const kitchen = this.trace(this.kitchenField, stand).reverse();
      const kitchenCell = kitchen.length > 0 ? this.cellOf(kitchen[0]!) : null;
      const toKitchen = kitchenCell === null ? [] : [...this.toHome(worker, kitchenCell)].reverse();
      legs = [
        { points: toKitchen, code: STAFF_STATE_CODE.walking },
        { points: kitchen, code: STAFF_STATE_CODE.serving },
        { points: back, code: STAFF_STATE_CODE.walking },
      ];
    } else {
      legs = [
        { points: out, code: STAFF_STATE_CODE.walking },
        { points: back, code: STAFF_STATE_CODE.walking },
      ];
      work = still(0, kind === "clean" ? STAFF_STATE_CODE.cleaning : STAFF_STATE_CODE["taking-order"], at);
    }
    const lengths = legs.map((leg) => polylineLength(leg.points));
    const distance = lengths.reduce((a, b) => a + b, 0);
    // Use distance/time, not an arbitrary fraction of the entire service task.
    const walk = distance > 0 ? Math.min(total, distance / STAFF_VISUAL_WALK_SPEED) : 0;
    const phases: Phase[] = legs.map((leg, i) => ({ ...leg, length: lengths[i]!, seconds: distance > 0 ? (walk * lengths[i]!) / distance : 0 }));
    if (work) {
      work.seconds = total - walk;
      phases.splice(1, 0, work);
    } else if (kind === "deliver" && total > walk && phases.length === 3) {
      const pickupSeconds = Math.min(5, (total - walk) / 2);
      const pickup = { ...still(pickupSeconds, STAFF_STATE_CODE.walking, phases[0]!.points.at(-1)!), activity: "pickup" as const };
      const putDown = { ...still(total - walk - pickupSeconds, STAFF_STATE_CODE.serving, at), activity: "put-down" as const };
      phases.splice(2, 0, putDown);
      phases.splice(1, 0, pickup);
    } else if (total > walk) phases.push(still(total - walk, STAFF_STATE_CODE.counter));
    return { phases: phases.filter((p) => p.seconds > 0 && p.points.length > 0), total };
  }

  /** ตำแหน่งพนักงานเมื่อทำงานนี้ไปแล้ว `elapsed` วินาที */
  sample(worker: number, plan: StaffPlan | null, elapsed: number): StaffSample {
    let t = elapsed;
    for (const phase of plan?.phases ?? []) {
      if (t > phase.seconds) {
        t -= phase.seconds;
        continue;
      }
      if (phase.points.length === 1 || phase.length === 0) return { ...phase.points[0]!, code: phase.code };
      let along = (t / phase.seconds) * phase.length;
      for (let i = 1; i < phase.points.length; i++) {
        const a = phase.points[i - 1]!;
        const b = phase.points[i]!;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (along <= d || i === phase.points.length - 1) {
          const f = d > 0 ? Math.min(1, along / d) : 1;
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, code: phase.code };
        }
        along -= d;
      }
    }
    return { ...this.homes[worker]!, code: STAFF_STATE_CODE.counter };
  }

  /** กำลังเดินอยู่ไหม (ใช้ตัดสินว่าข้ามช่วงเงียบได้หรือไม่) */
  isWalking(plan: StaffPlan | null, elapsed: number): boolean {
    const code = plan ? this.sample(0, plan, elapsed).code : STAFF_STATE_CODE.counter;
    return code === STAFF_STATE_CODE.walking || code === STAFF_STATE_CODE.serving;
  }
}
