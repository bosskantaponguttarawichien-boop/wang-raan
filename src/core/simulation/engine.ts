/**
 * P2 Customer Flow Simulation — Pure TypeScript (รันใน Web Worker)
 *
 * รูปแบบบริการ (serviceStyle) — MVP1 ใช้ร้านอาหาร "table-service" และเก็บ "counter-order" ไว้ให้เลือกในอนาคต
 * - table-service (แบบ A ร้านอาหารตามสั่ง): เข้าทางประตู → เดินไปเก้าอี้ว่าง → รอพนักงานหน้าร้านมารับออร์เดอร์
 *   → ครัวทำ (พ่อครัว 1 คนทำทีละจาน) → พนักงานเดินรับอาหารที่ประตูครัวมาเสิร์ฟ → ทาน
 *   → เดินไปจ่ายเงินที่เคาน์เตอร์ (รอคิวถ้าพนักงานไม่ว่าง) → เดินออก
 * - counter-order (แบบ B คาเฟ่): เข้าทางประตู → เดินไปเคาน์เตอร์ → (รอคิวถ้าช่องสั่งเต็ม) → สั่ง/จ่าย
 *   → เดินไปเก้าอี้ว่าง → นั่งทาน → เดินออกทางประตู
 *
 * - ลูกค้าเดินตาม Flow Field บน Occupancy Grid 0.25 ม. จึงไม่ทะลุสิ่งกีดขวาง
 * - พนักงานหน้าร้านและพ่อครัวเป็น "คิวงาน" (ยังไม่มีตัวเดินบนผัง) — เวลาเดินของพนักงานคิดจากระยะทางบนผังจริง
 * - ลูกค้าเข้าตามอัตราที่เปลี่ยนตามเวลา (ช่วงคนเยอะ) และไม่มีลูกค้าใหม่หลังปิดร้าน
 * - สุ่มด้วย seed (mulberry32) เพื่อให้ผลซ้ำได้และทดสอบได้ — ลูกค้า (เวลามาถึง เวลาทาน/สั่ง/จ่าย ฯลฯ) สุ่มจาก
 *   สายแยกจากการเลือกเก้าอี้ ผังเดียวกัน seed เดียวกัน จึงได้ลูกค้าชุดเดิมแม้เปลี่ยนจำนวนพนักงาน (เทียบผลกันได้)
 * - Heatmap สะสมเวลาที่ลูกค้า "เดินหรือรอคิว" อยู่ในแต่ละช่อง (ไม่นับเวลานั่งและเวลาที่กำลังสั่ง/จ่าย)
 */
import { footprint, objectCenter } from "../layout/geometry";
import type { Chair, Point, Rect, StoreLayout, Table } from "../layout/types";
import { computeFlowField, type FlowField } from "./flow-field";
import { CELL_FREE, buildOccupancyGrid, type OccupancyGrid } from "./occupancy-grid";
import { STAFF_STRIDE, STAFF_VISUAL_WALK_SPEED, StaffVisuals, type StaffPlan, type StaffTaskKind } from "./staff-visual";
import { buildPresentationSnapshot, foodKindFor, renderMemberId, taskMilestones, type PartyView, type TaskView } from "./presentation-snapshot";
import type { FoodKind } from "./presentation-contract";
import type { PresentationSnapshot } from "./presentation-contract";

export type ServiceStyle = "table-service" | "counter-order";

export type AgentState =
  | "waiting-entrance"
  | "to-counter"
  | "queuing"
  | "ordering"
  | "to-seat"
  | "waiting-order"
  | "waiting-food"
  | "seated"
  | "leaving";

/**
 * รหัสสถานะใน buffer ที่ส่งข้าม thread — ทุกช่วงที่นั่งอยู่ที่เก้าอี้ใช้รหัส 4 (ท่านั่ง)
 * table-service: 0 = เดินไปจ่ายเงิน, 1 = รอคิวจ่าย, 2 = กำลังจ่าย, 6 = รอโต๊ะหน้าร้าน (ภาพแสดงเป็นแถวนอกร้าน)
 */
export const AGENT_STATE_CODE: Record<AgentState, number> = {
  "waiting-entrance": 6,
  "to-counter": 0,
  queuing: 1,
  ordering: 2,
  "to-seat": 3,
  "waiting-order": 4,
  "waiting-food": 4,
  seated: 4,
  leaving: 5,
};

/** ค่าต่อ agent ใน buffer: id, x, y, stateCode */
export const AGENT_STRIDE = 4;

/** ความเร็วเดินของพนักงาน (ม./วินาที) */
export const STAFF_WALK_SPEED = STAFF_VISUAL_WALK_SPEED;
/** เวลาทำแต่ละจานแกว่งรอบค่าที่ตั้ง ±20% */
export const COOK_TIME_SPREAD = 0.2;
/** น้ำหนักกลุ่ม 1–4 คน (ไม่จำเป็นต้องรวมเป็น 100) */
export type PartyWeights = [number, number, number, number];
/** สัดส่วนเวลาปรุงเทียบกับค่าจานมาตรฐานที่ผู้ใช้กำหนด */
export const MENU_COOK_FACTORS: Readonly<Record<FoodKind, number>> = {
  "fried-rice": 1, noodles: 1, steak: 1.5, salad: 0.8, cake: 0.5,
};

export interface PeakWindow {
  /** วินาทีนับจากเริ่มจำลอง (= เปิดร้าน) */
  startSeconds: number;
  endSeconds: number;
  customersPerHour: number;
}

export interface BreakWindow { startSeconds: number; endSeconds: number }

export interface SimulationConfig {
  serviceStyle: ServiceStyle;
  /** ลูกค้าต่อชั่วโมงช่วงปกติ */
  customersPerHour: number;
  /** ช่วงคนเยอะ; null = อัตราเดียวทั้งวัน */
  peak: PeakWindow | null;
  peaks?: PeakWindow[];
  /** วินาทีที่ปิดร้าน (ไม่มีลูกค้าใหม่หลังจากนี้); null = ไม่ปิด */
  closeSeconds: number | null;
  seed: number;
  /** counter-order: เวลาสั่งที่เคาน์เตอร์ วินาที (สุ่มในช่วง) */
  orderSeconds: [number, number];
  /** นาที (สุ่มในช่วง) */
  dineMinutes: [number, number];
  /** เมตร/วินาที (สุ่มในช่วง) */
  walkSpeed: [number, number];
  /** counter-order: จำนวนคนที่สั่งที่เคาน์เตอร์พร้อมกันได้ต่อเคาน์เตอร์ */
  servingSlotsPerCounter: number;
  /** table-service: พนักงานหน้าร้าน (รับออร์เดอร์ เสิร์ฟ รับเงิน) */
  frontStaff: number;
  /** พนักงานประจำรับเงินจากจำนวนพนักงานหน้าร้าน */
  cashiers?: number;
  /** table-service: พ่อครัว — 1 คนทำทีละ 1 จาน */
  cooks: number;
  /** table-service: พ่อครัว 1 คนทำ 1 จานใช้กี่นาที */
  cookMinutesPerDish: number;
  /** table-service: เวลาคุยรับออร์เดอร์ที่โต๊ะ วินาที (ไม่รวมเวลาเดิน) */
  takeOrderSeconds: [number, number];
  /** table-service: เวลาจ่ายเงินที่เคาน์เตอร์ วินาที */
  paySeconds: [number, number];
  /** table-service: เวลาที่ใช้เก็บโต๊ะหนึ่งชุด (วินาที) */
  cleanTableSeconds: [number, number];
  /** ลูกค้ารอได้ไม่เกินกี่นาที (นับตั้งแต่นั่งลงจนได้อาหาร) */
  patienceMinutes: number;
  /** เวลารอโต๊ะ; ไม่ระบุใช้ค่า patienceMinutes เดิม */
  tablePatienceMinutes?: number;
  partyWeights?: PartyWeights;
  varyPatience?: boolean;
  /** จำนวนคนรอหน้าร้านที่ทำให้บางกลุ่มตัดสินใจกลับ; 0 = ไม่ใช้ */
  queueBalkAt?: number;
  varyMenuTimes?: boolean;
  varyStaffSpeed?: boolean;
  teamBreak?: BreakWindow;
  staggerBreak?: boolean;
  /** โอกาสที่ลูกค้าแต่ละคนจะสั่งเพิ่มหนึ่งจาน */
  extraDishPercent?: number;
}

/**
 * ค่าตั้งต้น — สั่ง/ทาน/เดิน/ช่องสั่ง ยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-10 (PRD §9 ข้อ 8, feat-034)
 * ค่าร้านอาหาร (พนักงาน พ่อครัว เวลาต่อจาน รับออร์เดอร์ จ่ายเงิน รอได้) เป็นค่าเสนอ feat-093 รอยืนยัน
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  serviceStyle: "table-service",
  customersPerHour: 40,
  peak: null,
  closeSeconds: null,
  seed: 1,
  orderSeconds: [30, 90],
  dineMinutes: [15, 40],
  walkSpeed: [1.0, 1.4],
  servingSlotsPerCounter: 2,
  frontStaff: 2,
  cooks: 1,
  cookMinutesPerDish: 5,
  takeOrderSeconds: [60, 120],
  paySeconds: [30, 60],
  cleanTableSeconds: [45, 90],
  patienceMinutes: 15,
};

export interface SimulationMetrics {
  /** เวลาจำลอง (วินาที) */
  time: number;
  arrived: number;
  /** ทานเสร็จแล้ว (table-service: จ่ายเงินแล้ว) */
  served: number;
  /** มาแล้วไม่มีที่นั่ง */
  noSeat: number;
  /** ส่วนหนึ่งของ noSeat: กลุ่มที่กลับทันทีเมื่อเห็นคิว */
  balked: number;
  /** ส่วนหนึ่งของ noSeat: ไม่มีโต๊ะที่รองรับจำนวนคนในกลุ่ม */
  noSuitableTable: number;
  /** ส่วนหนึ่งของ noSeat: รอโต๊ะจนหมดความอดทน */
  tableWaitTimeout: number;
  inStore: number;
  queuing: number;
  seated: number;
  maxQueue: number;
  /** เวลาเฉลี่ยตั้งแต่เข้าจนออก (นาที) ของคนที่ออกแล้ว */
  avgVisitMinutes: number;
  /** table-service: ได้อาหารแล้วกี่คน */
  fed: number;
  /** table-service: เวลารอเฉลี่ยตั้งแต่นั่งลงจนได้อาหาร (นาที) */
  avgFoodWaitMinutes: number;
  /** table-service: คนที่รออาหารนานเกิน patienceMinutes */
  waitedTooLong: number;
  /** table-service: ออร์เดอร์ที่รอพ่อครัวอยู่ตอนนี้ / สูงสุด */
  kitchenQueue: number;
  maxKitchenQueue: number;
  /** สัดส่วนเวลาที่พนักงานหน้าร้าน/พ่อครัวมีงาน (0–1) */
  frontStaffBusy: number;
  kitchenBusy: number;
  /** table-service: คนที่กำลังยืนรอโต๊ะสะอาดที่ทางเข้า / ค่าสูงสุด */
  waitingEntrance: number;
  maxEntranceQueue: number;
  /** table-service: เวลาเฉลี่ยที่ลูกค้ายืนรอโต๊ะสะอาดหน้าร้าน */
  avgEntranceWaitMinutes: number;
  /** table-service: ออกจากร้านเพราะรออาหารนานเกินกำหนด */
  abandoned: number;
  /** จานที่ปรุงแล้วแต่ถูกยกเลิกก่อนเสิร์ฟ */
  wastedDishes: number;
}

/** metrics เริ่มต้น (ค่า 0 ทั้งหมด) */
export function emptyMetrics(): SimulationMetrics {
  return {
    time: 0,
    arrived: 0,
    served: 0,
    noSeat: 0,
    balked: 0,
    noSuitableTable: 0,
    tableWaitTimeout: 0,
    inStore: 0,
    queuing: 0,
    seated: 0,
    maxQueue: 0,
    avgVisitMinutes: 0,
    fed: 0,
    avgFoodWaitMinutes: 0,
    waitedTooLong: 0,
    kitchenQueue: 0,
    maxKitchenQueue: 0,
    frontStaffBusy: 0,
    kitchenBusy: 0,
    waitingEntrance: 0,
    maxEntranceQueue: 0,
    avgEntranceWaitMinutes: 0,
    abandoned: 0,
    wastedDishes: 0,
  };
}

interface StaffTask {
  id: string;
  kind: StaffTaskKind;
  agent: Agent | null;
  tableId: string | null;
  createdAt: number;
}

interface Worker {
  startedAt: number;
  total: number;
  /** วินาทีที่เหลือของงานปัจจุบัน; 0 = ว่าง */
  remaining: number;
  task: StaffTask | null;
  /** เส้นทางเดินของงานปัจจุบัน (เฉพาะตอนเล่นภาพ) */
  plan: StaffPlan | null;
}

/** สถานะลูกค้าที่กำลังเดิน — ไม่มีใครเดินเลยถือเป็นช่วงเงียบ */
const WALKING_STATES: ReadonlySet<AgentState> = new Set(["to-counter", "to-seat", "leaving"]);

interface Agent {
  renderChairIds: readonly string[];
  serviceCycleId: string | null;
  fedAt: number | null;
  placedAt: number | null;
  id: number;
  state: AgentState;
  x: number;
  y: number;
  speed: number;
  /** offset ด้านข้างเล็กน้อย (แสดงผลไม่ให้จุดซ้อนกัน) */
  jitter: Point;
  field: FlowField | null;
  timer: number;
  chairId: string | null;
  tableId: string | null;
  /** 1 จุดใน simulation = 1 กลุ่มลูกค้า; ใช้กับความจุโต๊ะและ metrics */
  partySize: number;
  dishCounts: number[];
  preparedDishes: number;
  tablePatienceSeconds: number;
  foodPatienceSeconds: number;
  entranceQueuedAt: number | null;
  enteredAt: number;
  seatedAt: number;
  /** จำนวนจานของทั้งกลุ่มที่ยังทำไม่เสร็จ */
  pendingDishes: number;
  /** ลูกค้าตัดสินใจออกแล้ว; งานที่ค้างต้องไม่เสิร์ฟย้อนหลัง */
  cancelled: boolean;
  /** ลักษณะเฉพาะคน สุ่มตอนเข้าร้าน (วินาที; cookFactor = ตัวคูณเวลาทำจาน) */
  traits: { orderSeconds: number; dineSeconds: number; takeOrderSeconds: number; paySeconds: number; cookFactor: number };
}

type TableStatus = "clean" | "occupied" | "dirty" | "cleaning";

interface RuntimeTable {
  id: string;
  chairIds: readonly string[];
  status: TableStatus;
  cycle: number;
  cleanCompletedAt: number | null;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** สุ่มแยกจากลำดับลูกค้า/ออร์เดอร์ เพื่อให้เทียบสถานการณ์ด้วย seed เดิมได้ */
export function patienceFactor(seed: number, partyId: number): number {
  const random = mulberry32((seed ^ Math.imul(partyId, 0x9e3779b1)) >>> 0);
  return 0.8 + random() * 0.4;
}

/** ตัวคูณเวลางาน 0.8–1.2; คนเดียวใช้เวลามาตรฐาน */
export function staffTimeFactor(index: number, count: number): number {
  return count <= 1 ? 1 : 0.8 + 0.4 * index / (count - 1);
}

/** การเลือกจานเพิ่มแยกจากลำดับสุ่มลูกค้า เพื่อเปรียบเทียบสถานการณ์ได้ */
export function extraDishFor(seed: number, partyId: number, member: number, percent: number): boolean {
  const keyed = (seed ^ Math.imul(partyId, 0x9e3779b1) ^ Math.imul(member + 1, 0x85ebca6b) ^ 0x2c1b3c6d) >>> 0;
  return mulberry32(keyed)() * 100 < Math.max(0, Math.min(100, percent));
}

/** ช่องว่างที่ "ติด" วัตถุ (ศูนย์กลางช่องห่างจากวัตถุไม่เกิน 1 ช่อง) — จุดยืนใช้งานวัตถุนั้น */
export function touchingCells(grid: OccupancyGrid, rect: Rect): number[] {
  const s = grid.cellSize;
  const c0 = Math.max(0, Math.floor((rect.x - s) / s));
  const c1 = Math.min(grid.cols - 1, Math.ceil((rect.x + rect.width + s) / s));
  const r0 = Math.max(0, Math.floor((rect.y - s) / s));
  const r1 = Math.min(grid.rows - 1, Math.ceil((rect.y + rect.depth + s) / s));
  const cells: number[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const index = row * grid.cols + col;
      if (grid.cells[index] !== CELL_FREE) continue;
      const cx = (col + 0.5) * s;
      const cy = (row + 0.5) * s;
      const dx = Math.max(rect.x - cx, 0, cx - (rect.x + rect.width));
      const dy = Math.max(rect.y - cy, 0, cy - (rect.y + rect.depth));
      if (Math.hypot(dx, dy) <= s + 1e-9) cells.push(index);
    }
  }
  return cells;
}

/** ระยะเดินสั้นสุด (เมตร) จากช่องยืนข้างเก้าอี้ถึงเป้าหมายของ field; ไปไม่ถึงคืน Infinity */
function chairDistance(grid: OccupancyGrid, field: FlowField, chair: Chair): number {
  let best = Infinity;
  for (const cell of touchingCells(grid, footprint(chair))) best = Math.min(best, field.distance[cell]!);
  return best * grid.cellSize;
}

/**
 * ข้อมูลของผังที่ไม่ขึ้นกับค่าจำลอง (กริด, flow field, ระยะเดินพนักงาน) — คำนวณครั้งเดียวแล้วใช้ซ้ำ
 * ได้หลายรอบ (การวิเคราะห์ทั้งวันจำลองผังเดียวกันหลายสิบรอบ); ห้ามแก้ไขหลังสร้าง
 */
export interface PreparedStore {
  readonly layout: StoreLayout;
  readonly grid: OccupancyGrid;
  readonly counterCount: number;
  readonly counterField: FlowField;
  /** ช่องว่างเรียงจากเคาน์เตอร์ออกไป ใช้วางคิวจ่ายเงิน */
  readonly paymentQueueCells: readonly number[];
  readonly exitField: FlowField;
  /** เก้าอี้ที่ลูกค้าเดินไปถึงได้จากทางเข้า */
  readonly chairs: readonly Chair[];
  readonly tables: readonly Table[];
  readonly seatFields: ReadonlyMap<string, FlowField>;
  /** table-service: เวลาเดินของพนักงาน (วินาที) ต่อเก้าอี้ */
  readonly takeOrderWalk: ReadonlyMap<string, number>;
  readonly deliverWalk: ReadonlyMap<string, number>;
}

export function prepareStore(layout: StoreLayout): PreparedStore {
  const grid = buildOccupancyGrid(layout);
  const counters = layout.objects.filter((o) => o.type === "counter");
  const counterField = computeFlowField(grid, counters.flatMap((c) => touchingCells(grid, footprint(c))));
  const exitField = computeFlowField(grid, grid.entranceCells);
  const paymentQueueCells = Array.from(grid.cells.keys())
    .filter((cell) => grid.cells[cell] === CELL_FREE && Number.isFinite(counterField.distance[cell]!))
    .sort((a, b) => counterField.distance[a]! - counterField.distance[b]!);

  // เก้าอี้ที่ลูกค้าเดินไปถึงได้จากทางเข้าเท่านั้น
  const seatFields = new Map<string, FlowField>();
  const chairs = layout.objects
    .filter((o): o is Chair => o.type === "chair")
    .filter((chair) => {
      const field = computeFlowField(grid, touchingCells(grid, footprint(chair)));
      const reachable = grid.entranceCells.some((cell) => Number.isFinite(field.distance[cell]!));
      if (reachable) seatFields.set(chair.id, field);
      return reachable;
    });

  // พนักงานประจำที่เคาน์เตอร์: รับออร์เดอร์ = เคาน์เตอร์ → โต๊ะ → เคาน์เตอร์, เสิร์ฟ = ประตูครัว → โต๊ะ → เคาน์เตอร์
  // (เดินไปประตูครัวก่อนเสิร์ฟนับรวมในรอบเสิร์ฟ) — ไปไม่ถึงใช้ 0 เพื่อไม่ให้ค้าง; validation กันผังแบบนั้นไว้แล้ว
  const kitchenField = computeFlowField(grid, grid.kitchenCells);
  let kitchenToCounter = Infinity;
  for (const cell of grid.kitchenCells) kitchenToCounter = Math.min(kitchenToCounter, counterField.distance[cell]!);
  kitchenToCounter *= grid.cellSize;
  const finite = (meters: number) => (Number.isFinite(meters) ? meters : 0);
  const takeOrderWalk = new Map<string, number>();
  const deliverWalk = new Map<string, number>();
  for (const chair of chairs) {
    const toCounter = finite(chairDistance(grid, counterField, chair));
    const toKitchen = finite(chairDistance(grid, kitchenField, chair));
    takeOrderWalk.set(chair.id, (2 * toCounter) / STAFF_WALK_SPEED);
    deliverWalk.set(chair.id, (finite(kitchenToCounter) + toKitchen + toCounter) / STAFF_WALK_SPEED);
  }
  const tables = layout.objects.filter((o): o is Table => o.type === "table").filter((table) =>
    table.chairIds.some((id) => seatFields.has(id)),
  );
  return { layout, grid, counterCount: counters.length, counterField, paymentQueueCells, exitField, chairs, tables, seatFields, takeOrderWalk, deliverWalk };
}

export class Simulation {
  readonly grid: OccupancyGrid;
  readonly heatmap: Float32Array;
  private readonly config: SimulationConfig;
  /** สุ่มลูกค้า (การมาถึงและลักษณะเฉพาะคน) */
  private readonly random: () => number;
  /** เวลาเก็บโต๊ะแยกจากการมาถึง เพื่อให้เปรียบเทียบพนักงานด้วยลูกค้าชุดเดียวกัน */
  private readonly serviceRandom: () => number;
  /** สุ่มอื่น ๆ ที่ขึ้นกับสถานะร้าน (เลือกเก้าอี้) */
  private readonly seatRandom: () => number;
  private readonly counterField: FlowField;
  private readonly paymentQueueCells: readonly number[];
  private readonly exitField: FlowField;
  private readonly seatFields: ReadonlyMap<string, FlowField>;
  private readonly chairs: readonly Chair[];
  private readonly tableById = new Map<string, RuntimeTable>();
  private readonly chairById = new Map<string, Chair>();
  private readonly occupiedChairs = new Set<string>();
  private readonly servingSlots: number;
  /** table-service: เวลาเดินของพนักงาน (วินาที) ต่อเก้าอี้ */
  private readonly takeOrderWalk: ReadonlyMap<string, number>;
  private readonly deliverWalk: ReadonlyMap<string, number>;
  private readonly frontStaff: Worker[];
  private readonly layout: StoreLayout;
  private staffVisuals: StaffVisuals | null = null;
  private readonly cooks: Worker[];
  private readonly staffTasks: StaffTask[] = [];
  private readonly queuedCleanTables = new Set<string>();
  private readonly kitchenOrders: { agent: Agent; member: number; dishIndex: number }[] = [];
  private agents: Agent[] = [];
  private nextId = 1;
  private nextTaskId = 1;
  private readonly departed = new Map<string, PartyView>();
  private readonly presentationTasks = new Map<string, { task: StaffTask; startedAt: number; total: number; plan: StaffPlan | null; cycleId: string | null }>();
  private readonly memberPathPoints = new Map<number, { x: number; y: number; seated: boolean; chairId: string | null }>();
  private nextArrival: number;
  /** จุดที่ลูกค้าเดินผ่านตั้งแต่ drainPaths() ครั้งก่อน (x, y ต่อจุด) — null = ไม่เก็บ */
  private paths: Map<number, number[]> | null = null;
  private readonly maxPartyRate: number;
  private metrics: SimulationMetrics = emptyMetrics();
  private totalVisitSeconds = 0;
  private totalFoodWaitSeconds = 0;
  private totalEntranceWaitSeconds = 0;
  private entranceWaitedPeople = 0;
  private frontBusySeconds = 0;
  private kitchenBusySeconds = 0;
  private left = 0;

  /** รับผังโดยตรง หรือ PreparedStore จาก prepareStore() เพื่อใช้ซ้ำหลายรอบ */
  constructor(store: StoreLayout | PreparedStore, config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    this.random = mulberry32(this.config.seed);
    this.serviceRandom = mulberry32(this.config.seed ^ 0x3c6ef372);
    this.seatRandom = mulberry32(this.config.seed ^ 0x5bd1e995);
    const prepared = "grid" in store ? store : prepareStore(store);
    this.grid = prepared.grid;
    this.layout = prepared.layout;
    this.heatmap = new Float32Array(this.grid.cells.length);
    this.counterField = prepared.counterField;
    this.paymentQueueCells = prepared.paymentQueueCells;
    this.exitField = prepared.exitField;
    this.chairs = prepared.chairs;
    for (const chair of this.chairs) this.chairById.set(chair.id, chair);
    for (const table of prepared.tables) {
      const chairIds = table.chairIds.filter((id) => this.chairById.has(id));
      if (chairIds.length > 0) this.tableById.set(table.id, { id: table.id, chairIds, status: "clean", cycle: 0, cleanCompletedAt: null });
    }
    this.seatFields = prepared.seatFields;
    this.takeOrderWalk = prepared.takeOrderWalk;
    this.deliverWalk = prepared.deliverWalk;
    this.servingSlots = Math.max(1, prepared.counterCount * this.config.servingSlotsPerCounter);

    const team = (n: number): Worker[] => Array.from({ length: Math.max(1, Math.floor(n)) }, () => ({ remaining: 0, task: null, plan: null, startedAt: 0, total: 0 }));
    this.frontStaff = team(this.config.frontStaff);
    this.cooks = team(this.config.cooks);

    this.maxPartyRate =
      Math.max(this.config.customersPerHour, ...(this.config.peaks ?? (this.config.peak ? [this.config.peak] : [])).map((peak) => peak.customersPerHour)) / (this.tableService ? this.meanPartySize() : 1);
    this.nextArrival = this.sampleArrivalGap();
  }

  get seatCount() {
    return this.chairs.length;
  }

  private get tableService() {
    return this.config.serviceStyle === "table-service";
  }

  private between([min, max]: [number, number]) {
    return min + this.random() * (max - min);
  }

  /** ลูกค้าต่อชั่วโมง ณ เวลา t */
  rateAt(t: number): number {
    const { peak, peaks, closeSeconds } = this.config;
    if (closeSeconds !== null && t >= closeSeconds) return 0;
    const active = (peaks ?? (peak ? [peak] : [])).find((interval) => t >= interval.startSeconds && t < interval.endSeconds);
    if (active) return active.customersPerHour;
    return this.config.customersPerHour;
  }

  private partyRateAt(t: number) {
    return this.tableService ? this.rateAt(t) / this.meanPartySize() : this.rateAt(t);
  }

  private meanPartySize() {
    const weights = this.config.partyWeights ?? [1, 1, 1, 1];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return total > 0 ? weights.reduce((sum, weight, index) => sum + weight * (index + 1), 0) / total : 2.5;
  }

  /** ช่วงห่างการมาถึงที่อัตราสูงสุด (thinning ด้วย rateAt ตอนมาถึงจริง) */
  private sampleArrivalGap(): number {
    const rate = Math.max(1e-6, this.maxPartyRate / 3600);
    return -Math.log(1 - this.random()) / rate;
  }

  private cellOf(x: number, y: number): number {
    const s = this.grid.cellSize;
    const col = Math.min(this.grid.cols - 1, Math.max(0, Math.floor(x / s)));
    const row = Math.min(this.grid.rows - 1, Math.max(0, Math.floor(y / s)));
    return row * this.grid.cols + col;
  }

  private cellCenter(index: number): Point {
    const s = this.grid.cellSize;
    const col = index % this.grid.cols;
    return { x: (col + 0.5) * s, y: ((index - col) / this.grid.cols + 0.5) * s };
  }

  private spawn() {
    const entrances = this.grid.entranceCells;
    if (entrances.length === 0) return;
    const cell = entrances[Math.floor(this.random() * entrances.length)]!;
    const p = this.cellCenter(cell);
    const spread = 1 + (this.random() * 2 - 1) * COOK_TIME_SPREAD;
    const factor = this.config.varyPatience ? patienceFactor(this.config.seed, this.nextId) : 1;
    const agent: Agent = {
      renderChairIds: [], serviceCycleId: null, fedAt: null, placedAt: null,
      id: this.nextId++,
      state: "to-counter",
      x: p.x,
      y: p.y,
      speed: this.between(this.config.walkSpeed),
      jitter: { x: (this.random() - 0.5) * 0.1, y: (this.random() - 0.5) * 0.1 },
      field: this.counterField,
      timer: 0,
      chairId: null,
      tableId: null,
      partySize: this.partySize(),
      dishCounts: [],
      preparedDishes: 0,
      tablePatienceSeconds: (this.config.tablePatienceMinutes ?? this.config.patienceMinutes) * 60 * factor,
      foodPatienceSeconds: this.config.patienceMinutes * 60 * factor,
      entranceQueuedAt: null,
      enteredAt: this.metrics.time,
      seatedAt: 0,
      pendingDishes: 0,
      cancelled: false,
      traits: {
        orderSeconds: this.between(this.config.orderSeconds),
        dineSeconds: this.between(this.config.dineMinutes) * 60,
        takeOrderSeconds: this.between(this.config.takeOrderSeconds),
        paySeconds: this.between(this.config.paySeconds),
        cookFactor: spread,
      },
    };
    agent.dishCounts = Array.from({ length: agent.partySize }, (_, member) =>
      1 + Number(extraDishFor(this.config.seed, agent.id, member, this.config.extraDishPercent ?? 0)));
    this.agents.push(agent);
    this.markPath(agent);
    this.metrics.arrived += agent.partySize;
    // ถ้าไม่มีโต๊ะขนาดรองรับกลุ่มเลย ให้กลับทันที; ถ้ามีแต่ยังไม่สะอาดให้รอหน้าเข้า
    if (this.tableService && !this.goToChair(agent)) {
      if (!this.hasTableForParty(agent.partySize)) {
        this.metrics.noSuitableTable += agent.partySize;
        this.abandon(agent, true);
      } else {
        const queuePeople = this.agents.reduce((sum, other) => sum + (other.state === "waiting-entrance" ? other.partySize : 0), 0);
        const limit = this.config.queueBalkAt ?? 0;
        const balk = limit > 0 && queuePeople >= limit && mulberry32((this.config.seed ^ Math.imul(agent.id, 0x9e3779b1) ^ 0x7f4a7c15) >>> 0)() < 0.5;
        if (balk) {
          this.metrics.balked += agent.partySize;
          this.abandon(agent, true);
        } else {
          agent.field = null;
          agent.state = "waiting-entrance";
          agent.entranceQueuedAt = this.metrics.time;
        }
      }
    }
  }

  /** สุ่มจำนวนคนในกลุ่ม 1–4 คน (Agent หนึ่งตัวแทนหนึ่งกลุ่ม) */
  private partySize() {
    if (!this.tableService) return 1;
    const weights = this.config.partyWeights ?? [1, 1, 1, 1];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return 1 + Math.floor(this.random() * 4);
    let draw = this.random() * total;
    for (let i = 0; i < weights.length; i++) {
      draw -= weights[i]!;
      if (draw < 0) return i + 1;
    }
    return 4;
  }

  /** จองโต๊ะสะอาดที่รองรับทั้งกลุ่ม แล้วให้ leader เดินไปยังเก้าอี้ตัวแรก */
  private goToChair(agent: Agent): boolean {
    if (!this.tableService) {
      const chair = this.pickChair();
      if (!chair) return false;
      this.occupiedChairs.add(chair.id);
      agent.chairId = chair.id;
      agent.renderChairIds = [chair.id];
      agent.serviceCycleId = `counter:${chair.tableId}`;
      agent.field = this.seatFields.get(chair.id)!;
      agent.state = "to-seat";
      return true;
    }
    const table = this.pickTable(agent.partySize);
    if (!table) return false;
    const chair = this.chairById.get(table.chairIds[0]!)!;
    table.status = "occupied";
    table.cycle++;
    table.cleanCompletedAt = null;
    this.departed.delete(table.id);
    for (const chairId of table.chairIds) this.occupiedChairs.add(chairId);
    agent.tableId = table.id;
    agent.renderChairIds = table.chairIds.slice(0, agent.partySize);
    agent.serviceCycleId = `${table.id}:${table.cycle}`;
    agent.chairId = chair.id;
    agent.field = this.seatFields.get(chair.id)!;
    agent.state = "to-seat";
    return true;
  }

  /** เดินตาม flow field; คืน true เมื่อถึงเป้าหมาย */
  private walk(agent: Agent, dt: number): boolean {
    const field = agent.field;
    if (!field) return true;
    let budget = agent.speed * dt;
    for (let guard = 0; guard < 64; guard++) {
      const cell = this.cellOf(agent.x, agent.y);
      if (!Number.isFinite(field.distance[cell]!)) return true; // ไปไม่ถึง: ถือว่าจบ (ป้องกันค้าง)
      const atGoal = field.distance[cell] === 0;
      const target = this.cellCenter(atGoal ? cell : field.next[cell]!);
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const dist = Math.hypot(dx, dy);
      if (atGoal && dist < 1e-6) return true;
      if (dist <= budget) {
        agent.x = target.x;
        agent.y = target.y;
        this.markPath(agent);
        budget -= dist;
        if (atGoal) return true;
      } else {
        agent.x += (dx / dist) * budget;
        agent.y += (dy / dist) * budget;
        return false;
      }
    }
    return false;
  }

  private hasTableForParty(partySize: number) {
    return [...this.tableById.values()].some((table) => table.chairIds.length >= partySize);
  }

  private pickTable(partySize: number): RuntimeTable | null {
    const free = [...this.tableById.values()].filter((table) => table.status === "clean" && table.chairIds.length >= partySize);
    if (free.length === 0) return null;
    const smallest = Math.min(...free.map((table) => table.chairIds.length));
    const suitable = free.filter((table) => table.chairIds.length === smallest);
    return suitable[Math.floor(this.seatRandom() * suitable.length)]!;
  }

  private pickChair(): Chair | null {
    const free = this.chairs.filter((chair) => !this.occupiedChairs.has(chair.id));
    return free.length === 0 ? null : free[Math.floor(this.seatRandom() * free.length)]!;
  }

  /** นั่งลงกลางเก้าอี้ */
  private sitDown(agent: Agent) {
    const chair = this.chairs.find((c) => c.id === agent.chairId)!;
    const center = objectCenter(chair);
    agent.x = center.x;
    agent.y = center.y;
    agent.jitter = { x: 0, y: 0 };
    this.markPath(agent, true);
  }

  /** ลุกจากเก้าอี้ ออกมายืนที่ช่องว่างข้างเก้าอี้ */
  private standUp(agent: Agent) {
    if (!this.tableService) this.occupiedChairs.delete(agent.chairId!);
    const field = this.seatFields.get(agent.chairId!)!;
    const chair = this.chairById.get(agent.chairId!)!;
    const standCell = touchingCells(this.grid, footprint(chair)).find((c) => field.distance[c] === 0);
    if (standCell !== undefined) Object.assign(agent, this.cellCenter(standCell));
    this.markPath(agent, false);
  }

  /** เริ่มเก็บทางเดินของลูกค้า ให้ภาพเดินตามทางจริงได้ (ไม่ตัดผ่านโต๊ะ) แม้ tick ห่างกันหลายเมตร */
  trackPaths() {
    this.paths ??= new Map();
    if (this.tableService) this.staffVisuals ??= new StaffVisuals(this.layout, this.frontStaff.length);
    this.frontStaff.forEach((staff, index) => {
      if (!staff.task || staff.plan || !this.staffVisuals) return;
      staff.plan = this.staffVisuals.plan(index, staff.task.kind, staff.task.tableId ?? staff.task.agent?.tableId ?? null, staff.total, this.walkSeconds(staff.task));
      for (const record of this.presentationTasks.values()) if (record.task.id === staff.task.id) record.plan = staff.plan;
    });
  }

  /** ตำแหน่งพนักงานหน้าร้าน (index, x, y, STAFF_STATE_CODE) — ว่างเมื่อไม่ได้ trackPaths */
  staffBuffer(): Float32Array {
    const visuals = this.staffVisuals;
    if (!visuals) return new Float32Array(0);
    const buffer = new Float32Array(this.frontStaff.length * STAFF_STRIDE);
    this.frontStaff.forEach((staff, i) => {
      const p = visuals.sample(i, staff.plan, staff.plan ? staff.plan.total - staff.remaining : 0);
      buffer.set([i, p.x, p.y, p.code], i * STAFF_STRIDE);
    });
    return buffer;
  }

  /** ไม่มีลูกค้าหรือพนักงานคนไหนกำลังเดิน (ทุกคนนั่ง/ยืนรอ/ทำงานอยู่กับที่) */
  isQuiet(): boolean {
    if (this.agents.some((agent) => WALKING_STATES.has(agent.state))) return false;
    const visuals = this.staffVisuals;
    return !visuals || !this.frontStaff.some((staff) => visuals.isWalking(staff.plan, staff.plan ? staff.plan.total - staff.remaining : 0));
  }

  /** ร้านว่าง: ไม่มีลูกค้าในร้านและพนักงานไม่มีงาน */
  isEmpty(): boolean {
    return this.agents.length === 0 && this.frontStaff.every((staff) => !staff.task) && this.cooks.every((cook) => !cook.task);
  }

  /** ให้ลูกค้ากลุ่มแรกมาถึงทันทีตอนเริ่มเล่นภาพ (ไม่ต้องรอนั่งดูร้านว่างหลายนาที โดยเวลาจำลองยังเริ่มจาก 0 และเดิน 1 วิ = 1 วิ) */
  spawnFirstCustomer() {
    if (this.agents.length === 0 && this.rateAt(this.metrics.time) > 0) {
      this.spawn();
    }
  }

  /** เดินเวลาต่อได้ไม่เกิน maxSeconds ระหว่างที่ยังเงียบอยู่ — หยุดทันทีที่มีคนเริ่มเดิน คืนวินาทีที่เดินไป */
  stepWhileQuiet(maxSeconds: number): number {
    let elapsed = 0;
    while (elapsed < maxSeconds - 1e-9 && this.isQuiet()) {
      const h = Math.min(1, maxSeconds - elapsed);
      this.advance(h);
      elapsed += h;
    }
    return elapsed;
  }

  /** ทางเดินตั้งแต่ครั้งก่อน: [id, จำนวนจุด, x1, y1, x2, y2, ...] ต่อกันทุกคน (รวมคนที่เพิ่งออกจากร้าน) */
  drainPaths(): Float32Array {
    const out: number[] = [];
    if (this.paths) for (const agent of this.agents) this.markPath(agent);
    for (const [id, points] of this.paths ?? []) out.push(id, points.length / 2, ...points);
    this.paths?.clear();
    return new Float32Array(out);
  }

  private memberPosition(agent: Agent, member: number, seated = AGENT_STATE_CODE[agent.state] === 4): Point {
    const chair = this.chairById.get(agent.renderChairIds[member] ?? "");
    if (seated && chair) return objectCenter(chair);
    return { x: agent.x + agent.jitter.x + (member % 2 - 0.5) * 0.14, y: agent.y + agent.jitter.y + (Math.floor(member / 2) - 0.5) * 0.14 };
  }

  /** Free-cell junctions keep the branch to each assigned chair out of other furniture. */
  private appendMemberRoute(id: number, from: Point, target: Point, chairId: string, entering: boolean) {
    const chair = this.chairById.get(chairId)!;
    const seatField = this.seatFields.get(chairId)!;
    const stand = touchingCells(this.grid, footprint(chair)).find(cell => seatField.distance[cell] === 0);
    if (stand === undefined) { this.appendPath(id, target.x, target.y); return; }
    let cell = this.cellOf(from.x, from.y);
    const field = entering ? seatField : computeFlowField(this.grid, [this.cellOf(target.x, target.y)]);
    if (!entering) { cell = stand; const p = this.cellCenter(cell); this.appendPath(id, p.x, p.y); }
    if (this.grid.cells[cell] !== CELL_FREE) cell = stand;
    for (let guard = 0; guard < this.grid.cells.length; guard++) {
      const p = this.cellCenter(cell); this.appendPath(id, p.x, p.y);
      if (field.distance[cell] === 0 || field.next[cell]! < 0 || !Number.isFinite(field.distance[cell]!)) break;
      cell = field.next[cell]!;
    }
    this.appendPath(id, target.x, target.y);
  }

  private markPath(agent: Agent, seated = AGENT_STATE_CODE[agent.state] === 4) {
    if (!this.paths) return;
    for (let member = 0; member < agent.partySize; member++) {
      const id = renderMemberId(agent.id, member), target = this.memberPosition(agent, member, seated);
      const previous = this.memberPathPoints.get(id);
      const chairId = agent.renderChairIds[member] ?? null;
      if (previous && previous.seated === seated && Math.hypot(previous.x - target.x, previous.y - target.y) < 1e-7) continue;
      if (previous && previous.seated !== seated && chairId) this.appendMemberRoute(id, previous, target, chairId, seated);
      else this.appendPath(id, target.x, target.y);
      this.memberPathPoints.set(id, { ...target, seated, chairId });
    }
  }

  private appendPath(id: number, x: number, y: number) {
    let points = this.paths!.get(id);
    if (!points) this.paths!.set(id, (points = []));
    const n = points.length;
    if (n >= 2 && Math.hypot(x - points[n - 2]!, y - points[n - 1]!) < 1e-7) return;
    if (n >= 4) {
      const ax = points[n - 4]!, ay = points[n - 3]!, bx = points[n - 2]!, by = points[n - 1]!;
      if (Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < 1e-6 && (bx - ax) * (x - bx) + (by - ay) * (y - by) >= 0) {
        points[n - 2] = x; points[n - 1] = y; return;
      }
    }
    points.push(x, y);
  }

  private leave(agent: Agent) {
    agent.field = this.exitField;
    agent.state = "leaving";
  }

  /** ตัดงานที่ยังไม่เริ่มของลูกค้าที่ออกจากร้าน เพื่อไม่ให้มีอาหาร/บริการผี */
  private cancelQueuedWork(agent: Agent) {
    for (let i = this.staffTasks.length - 1; i >= 0; i--) {
      if (this.staffTasks[i]!.agent === agent) this.staffTasks.splice(i, 1);
    }
    for (let i = this.kitchenOrders.length - 1; i >= 0; i--) {
      if (this.kitchenOrders[i]!.agent === agent) this.kitchenOrders.splice(i, 1);
    }
  }

  /** ลูกค้าถอนตัว: โต๊ะต้องเข้าสู่วงจรเก็บโต๊ะ และงานค้างต้องไม่เสิร์ฟย้อนหลัง */
  private abandon(agent: Agent, noSeat: boolean) {
    if (agent.cancelled) return;
    agent.cancelled = true;
    this.metrics.wastedDishes += agent.preparedDishes;
    agent.preparedDishes = 0;
    this.cancelQueuedWork(agent);
    // ลูกค้านั่งอยู่กลาง footprint ของเก้าอี้ จึงต้องลุกไปช่องเดินก่อนหาเส้นออก
    if (agent.tableId && agent.chairId) this.standUp(agent);
    if (agent.tableId) this.markTableDirty(agent.tableId);
    if (noSeat) this.metrics.noSeat += agent.partySize;
    else this.metrics.abandoned += agent.partySize;
    this.leave(agent);
  }

  step(dt: number) {
    // walk() ไล่ผ่านหลาย cell ตาม budget ได้อยู่แล้ว; แบ่งไม่เกิน 1 วินาที
    // เพื่อให้การวิเคราะห์ทั้งวันไม่วนคิวหน้าร้านเดิมซ้ำเกินจำเป็น
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(1, remaining);
      this.advance(h);
      remaining -= h;
    }
  }

  private advance(dt: number) {
    this.metrics.time += dt;
    this.nextArrival -= dt;
    while (this.nextArrival <= 0) {
      const t = this.metrics.time + this.nextArrival;
      const rate = this.partyRateAt(t);
      // ช่วงที่อัตราต่ำกว่าสูงสุด ตัดการมาถึงทิ้งตามสัดส่วน (non-homogeneous Poisson)
      if (rate > 0 && (rate >= this.maxPartyRate || this.random() < rate / this.maxPartyRate)) this.spawn();
      this.nextArrival += this.sampleArrivalGap();
    }

    if (this.tableService) this.advanceStaff(dt);

    const ordering = this.tableService ? 0 : this.agents.filter((a) => a.state === "ordering").length;
    let freeSlots = this.servingSlots - ordering;

    for (const agent of this.agents) {
      switch (agent.state) {
        case "waiting-entrance":
          if (agent.entranceQueuedAt !== null && this.metrics.time - agent.entranceQueuedAt >= agent.tablePatienceSeconds) {
            this.metrics.tableWaitTimeout += agent.partySize;
            this.abandon(agent, true);
          }
          break;
        case "to-counter":
          if (this.walk(agent, dt)) {
            agent.state = "queuing";
            if (this.tableService) this.addTask("pay", agent);
          }
          break;
        case "queuing":
          break;
        case "waiting-order":
        case "waiting-food":
          if (this.metrics.time - agent.seatedAt >= agent.foodPatienceSeconds) this.abandon(agent, false);
          break;
        case "ordering":
          if (this.tableService) break; // จ่ายเงิน: จบเมื่อพนักงานทำงาน pay เสร็จ
          agent.timer -= dt;
          if (agent.timer <= 0 && !this.goToChair(agent)) {
            this.metrics.noSeat += agent.partySize;
            this.leave(agent);
          }
          break;
        case "to-seat":
          if (this.walk(agent, dt)) {
            this.sitDown(agent);
            if (this.tableService) {
              agent.seatedAt = this.metrics.time;
              agent.state = "waiting-order";
              this.addTask("take-order", agent);
            } else {
              agent.fedAt = this.metrics.time;
              agent.placedAt = this.metrics.time;
              agent.timer = agent.traits.dineSeconds;
              agent.state = "seated";
            }
          }
          break;
        case "seated":
          agent.timer -= dt;
          if (agent.timer <= 0) {
            this.standUp(agent);
            if (this.tableService) {
              agent.field = this.counterField;
              agent.state = "to-counter";
            } else {
              this.leave(agent);
              this.metrics.served++;
            }
          }
          break;
        case "leaving":
          this.walk(agent, dt); // ออกจากร้านเมื่อถึงประตู (ตรวจด้านล่าง)
          break;
      }
    }

    // counter-order: เรียกคิวตามลำดับการมาถึง
    if (!this.tableService) {
      for (const agent of this.agents) {
        if (freeSlots <= 0) break;
        if (agent.state === "queuing") {
          agent.state = "ordering";
          agent.timer = agent.traits.orderSeconds;
          freeSlots--;
        }
      }
    }

    if (this.tableService) this.positionPaymentQueue();

    // ออกจากร้านเมื่อถึงประตู
    this.agents = this.agents.filter((agent) => {
      if (agent.state === "leaving" && this.exitField.distance[this.cellOf(agent.x, agent.y)] === 0) {
        if (this.tableService && agent.tableId) this.markTableDirty(agent.tableId);
        if (!this.tableService || agent.seatedAt > 0) {
          this.left += agent.partySize;
          this.totalVisitSeconds += (this.metrics.time - agent.enteredAt) * agent.partySize;
        }
        for (let member = 0; member < agent.partySize; member++) this.memberPathPoints.delete(renderMemberId(agent.id, member));
        return false;
      }
      return true;
    });

    let queuing = 0;
    let seated = 0;
    let waitingEntrance = 0;
    let peopleInStore = 0;
    for (const agent of this.agents) {
      const code = AGENT_STATE_CODE[agent.state];
      peopleInStore += agent.partySize;
      if (agent.state === "queuing") queuing += agent.partySize;
      if (agent.state === "waiting-entrance") waitingEntrance += agent.partySize;
      if (code === 4) seated += agent.partySize;
      if (code !== 4 && agent.state !== "ordering") this.heatmap[this.cellOf(agent.x, agent.y)]! += dt * agent.partySize;
    }
    const m = this.metrics;
    m.inStore = peopleInStore;
    m.queuing = queuing;
    m.seated = seated;
    m.maxQueue = Math.max(m.maxQueue, queuing);
    m.avgVisitMinutes = this.left > 0 ? this.totalVisitSeconds / this.left / 60 : 0;
    m.avgFoodWaitMinutes = m.fed > 0 ? this.totalFoodWaitSeconds / m.fed / 60 : 0;
    m.avgEntranceWaitMinutes = this.entranceWaitedPeople > 0 ? this.totalEntranceWaitSeconds / this.entranceWaitedPeople / 60 : 0;
    m.kitchenQueue = this.kitchenOrders.length;
    m.maxKitchenQueue = Math.max(m.maxKitchenQueue, this.kitchenOrders.length);
    m.frontStaffBusy = m.time > 0 ? this.frontBusySeconds / (this.frontStaff.length * m.time) : 0;
    m.kitchenBusy = m.time > 0 ? this.kitchenBusySeconds / (this.cooks.length * m.time) : 0;
    m.waitingEntrance = waitingEntrance;
    m.maxEntranceQueue = Math.max(m.maxEntranceQueue, waitingEntrance);
  }

  private addTask(kind: StaffTaskKind, agent: Agent) {
    if (!agent.cancelled) this.staffTasks.push({ id: `task:${this.nextTaskId++}`, kind, agent, tableId: null, createdAt: this.metrics.time });
  }

  /** ช่องคิวจ่ายเงิน: เรียงจากเคาน์เตอร์ออกไปตาม flow field และไม่ใช้ช่องซ้ำ */
  private positionPaymentQueue() {
    const queue = this.agents
      .filter((agent) => agent.state === "ordering" || agent.state === "queuing")
      .sort((a, b) => (a.state === "ordering" ? -1 : b.state === "ordering" ? 1 : a.enteredAt - b.enteredAt));
    queue.forEach((agent, index) => {
      const cell = this.paymentQueueCells[Math.min(index, this.paymentQueueCells.length - 1)];
      if (cell !== undefined) Object.assign(agent, this.cellCenter(cell));
    });
  }

  private markTableDirty(tableId: string) {
    const table = this.tableById.get(tableId);
    if (!table || table.status !== "occupied") return;
    table.status = "dirty";
    const departed = this.agents.find(agent => agent.tableId === tableId && agent.serviceCycleId === `${table.id}:${table.cycle}`);
    if (departed) this.departed.set(tableId, this.partyView(departed));
    for (const chairId of table.chairIds) this.occupiedChairs.delete(chairId);
    if (!this.queuedCleanTables.has(tableId)) {
      this.queuedCleanTables.add(tableId);
      this.staffTasks.push({ id: `task:${this.nextTaskId++}`, kind: "clean", agent: null, tableId, createdAt: this.metrics.time });
    }
  }

  /** เดินเวลางานของพนักงานหน้าร้านและพ่อครัว แล้วแจกงานใหม่ให้คนที่ว่าง */
  private advanceStaff(dt: number) {
    for (const cook of this.cooks) {
      if (!cook.task) continue;
      this.kitchenBusySeconds += dt;
      cook.remaining -= dt;
      if (cook.remaining <= 0) {
        const agent = cook.task.agent!;
        if (agent.cancelled) this.metrics.wastedDishes++;
        else {
          agent.preparedDishes++;
          if (--agent.pendingDishes === 0) this.addTask("deliver", agent);
        }
        cook.task = null;
      }
    }
    for (const staff of this.frontStaff) {
      if (!staff.task) continue;
      // ลูกค้ายกเลิกแล้ว งานรับออร์เดอร์หรือเสิร์ฟที่กำลังทำต้องหยุดด้วย
      // เพื่อให้พนักงานไปรับงานถัดไปแทนการทำงานให้ลูกค้าที่ออกไปแล้ว
      if (staff.task.agent?.cancelled) {
        staff.task = null;
        staff.plan = null;
        continue;
      }
      this.frontBusySeconds += dt;
      staff.remaining -= dt;
      if (staff.task.kind === "deliver" && staff.task.agent && !staff.task.agent.cancelled && staff.plan) {
        const task = staff.task;
        const placement = taskMilestones({ id: task.id, kind: task.kind, tableId: task.agent!.tableId, cycleId: task.agent!.serviceCycleId,
          startedAt: staff.startedAt, total: staff.total, plan: staff.plan, party: null }).placedAtSeconds;
        if (placement !== null && this.metrics.time >= placement) task.agent!.placedAt ??= placement;
      }
      if (staff.remaining <= 0) {
        this.finishTask(staff.task);
        staff.task = null;
        staff.plan = null;
      }
    }

    // งานที่เริ่มแล้วทำให้เสร็จก่อน แต่ไม่รับงานใหม่ระหว่างช่วงพัก
    for (const [index, cook] of this.cooks.entries()) {
      if (cook.task || this.isStaffOnBreak(index, this.cooks.length) || this.kitchenOrders.length === 0) continue;
      const { agent, member, dishIndex } = this.kitchenOrders.shift()!;
      cook.task = { id: `task:${this.nextTaskId++}`, kind: "deliver", agent, tableId: null, createdAt: this.metrics.time };
      const menuFactor = this.config.varyMenuTimes ? MENU_COOK_FACTORS[foodKindFor(this.config.seed, agent.id, member + agent.partySize * dishIndex)] : 1;
      const speedFactor = this.config.varyStaffSpeed ? staffTimeFactor(index, this.cooks.length) : 1;
      cook.remaining = this.config.cookMinutesPerDish * 60 * agent.traits.cookFactor * menuFactor * speedFactor;
    }

    if (this.staffTasks.length === 0) return;
    this.staffTasks.sort((a, b) => this.taskPriority(a) - this.taskPriority(b) || a.createdAt - b.createdAt);
    for (let i = this.staffTasks.length - 1; i >= 0; i--) if (this.staffTasks[i]!.agent?.cancelled) this.staffTasks.splice(i, 1);
    const cashiers = Math.min(Math.max(0, Math.floor(this.config.cashiers ?? 0)), this.frontStaff.length - 1);
    for (const [index, staff] of this.frontStaff.entries()) {
      if (staff.task || this.isStaffOnBreak(index, this.frontStaff.length) || this.staffTasks.length === 0) continue;
      const taskIndex = this.staffTasks.findIndex((task) => cashiers === 0 || (index < cashiers ? task.kind === "pay" : task.kind !== "pay"));
      if (taskIndex < 0) continue;
      const [task] = this.staffTasks.splice(taskIndex, 1);
      if (!task) continue;
      staff.task = task;
      staff.remaining = this.taskSeconds(task, index);
      staff.total = staff.remaining;
      staff.startedAt = this.metrics.time;
      staff.plan = this.staffVisuals?.plan(index, task.kind, task.tableId ?? task.agent?.tableId ?? null, staff.remaining, this.walkSeconds(task)) ?? null;
      const tableId = task.tableId ?? task.agent?.tableId ?? null;
      if (tableId) this.presentationTasks.set(`${tableId}:${task.kind}`, {
        task, startedAt: staff.startedAt, total: staff.total, plan: staff.plan,
        cycleId: task.agent?.serviceCycleId ?? `${tableId}:${this.tableById.get(tableId)?.cycle ?? 0}`,
      });
      if (task.kind === "pay" && task.agent) task.agent.state = "ordering";
      if (task.kind === "clean" && task.tableId) this.tableById.get(task.tableId)!.status = "cleaning";
    }
  }

  private isStaffOnBreak(index: number, count: number): boolean {
    const rest = this.config.teamBreak;
    if (!rest) return false;
    const duration = rest.endSeconds - rest.startSeconds;
    const start = rest.startSeconds + (this.config.staggerBreak ? duration * index / count : 0);
    const end = this.config.staggerBreak ? rest.startSeconds + duration * (index + 1) / count : rest.endSeconds;
    return this.metrics.time >= start && this.metrics.time < end;
  }

  /** ระยะเดินไปจุดบริการที่ใกล้ที่สุดของโต๊ะ ไม่ผูกกับเก้าอี้ตัวแรกของ preset */
  private tableWalk(tableId: string | null | undefined, walks: ReadonlyMap<string, number>) {
    const table = tableId ? this.tableById.get(tableId) : null;
    return table ? Math.min(...table.chairIds.map((chairId) => walks.get(chairId) ?? Infinity)) : 0;
  }

  private taskSeconds(task: StaffTask, index: number): number {
    const party = task.agent?.partySize ?? 1;
    const cashiers = Math.min(Math.max(0, Math.floor(this.config.cashiers ?? 0)), this.frontStaff.length - 1);
    // กระจายความเร็วภายในแต่ละบทบาท เพื่อไม่ให้คนประจำรับเงินเร็วหรือช้ากว่าเสมอ
    const factor = !this.config.varyStaffSpeed ? 1 : cashiers === 0
      ? staffTimeFactor(index, this.frontStaff.length)
      : index < cashiers ? staffTimeFactor(index, cashiers) : staffTimeFactor(index - cashiers, this.frontStaff.length - cashiers);
    switch (task.kind) {
      case "take-order":
        return this.tableWalk(task.agent!.tableId, this.takeOrderWalk) + (task.agent!.traits.takeOrderSeconds + (party - 1) * 15) * factor;
      case "deliver":
        return this.tableWalk(task.agent!.tableId, this.deliverWalk) + task.agent!.dishCounts.reduce((sum, count) => sum + count, 0) * 10 * factor;
      case "pay":
        return task.agent!.traits.paySeconds * factor;
      case "clean":
        return this.tableWalk(task.tableId, this.takeOrderWalk) + (this.config.cleanTableSeconds[0] + this.serviceRandom() * (this.config.cleanTableSeconds[1] - this.config.cleanTableSeconds[0])) * factor;
    }
  }

  /** ส่วนที่เป็นการเดินของเวลางาน (taskSeconds) — ใช้แบ่งเวลาในภาพเท่านั้น */
  private walkSeconds(task: StaffTask): number {
    switch (task.kind) {
      case "take-order":
        return this.tableWalk(task.agent!.tableId, this.takeOrderWalk);
      case "clean":
        return this.tableWalk(task.tableId, this.takeOrderWalk);
      case "deliver":
        return this.tableWalk(task.agent!.tableId, this.deliverWalk);
      case "pay":
        return 0;
    }
  }

  /** งานพนักงาน: ส่งอาหาร > รับเงิน > เก็บโต๊ะที่ปลดล็อกคิวหน้าเข้า > รับออเดอร์ > เก็บโต๊ะทั่วไป */
  private taskPriority(task: StaffTask) {
    if (task.kind === "deliver") return 0;
    if (task.kind === "pay") return 1;
    if (task.kind === "take-order") return 3;
    const table = this.tableById.get(task.tableId!);
    const unblocks = table && this.agents.some((a) => a.state === "waiting-entrance" && a.partySize <= table.chairIds.length);
    return unblocks ? 2 : 4;
  }

  private finishTask(task: StaffTask) {
    const { agent } = task;
    switch (task.kind) {
      case "take-order":
        if (agent!.cancelled) break;
        agent!.state = "waiting-food";
        agent!.pendingDishes = agent!.dishCounts.reduce((sum, count) => sum + count, 0);
        for (let member = 0; member < agent!.partySize; member++) {
          for (let dishIndex = 0; dishIndex < agent!.dishCounts[member]!; dishIndex++) this.kitchenOrders.push({ agent: agent!, member, dishIndex });
        }
        break;
      case "deliver": {
        if (agent!.cancelled) break;
        agent!.preparedDishes = 0;
        const wait = this.metrics.time - agent!.seatedAt;
        this.metrics.fed += agent!.partySize;
        this.totalFoodWaitSeconds += wait * agent!.partySize;
        if (wait > agent!.foodPatienceSeconds) this.metrics.waitedTooLong += agent!.partySize;
        agent!.timer = agent!.traits.dineSeconds;
        agent!.fedAt = this.metrics.time;
        agent!.placedAt ??= this.metrics.time;
        agent!.state = "seated";
        break;
      }
      case "pay":
        this.metrics.served += agent!.partySize;
        this.leave(agent!);
        break;
      case "clean": {
        const table = this.tableById.get(task.tableId!);
        if (!table) break;
        table.status = "clean";
        table.cleanCompletedAt = this.metrics.time;
        this.departed.delete(table.id);
        this.queuedCleanTables.delete(table.id);
        this.seatWaitingParty(table);
        break;
      }
    }
  }

  /** เลือกกลุ่มที่มาก่อนและนั่งโต๊ะนี้ได้; กลุ่มใหญ่ไม่ขวางกลุ่มเล็กที่จะใช้โต๊ะเล็ก */
  private seatWaitingParty(table: RuntimeTable) {
    const waiting = this.agents.find((agent) => agent.state === "waiting-entrance" && agent.partySize <= table.chairIds.length);
    if (!waiting) return;
    table.status = "occupied";
    table.cycle++;
    table.cleanCompletedAt = null;
    this.departed.delete(table.id);
    for (const chairId of table.chairIds) this.occupiedChairs.add(chairId);
    const chair = this.chairById.get(table.chairIds[0]!)!;
    waiting.tableId = table.id;
    waiting.renderChairIds = table.chairIds.slice(0, waiting.partySize);
    waiting.serviceCycleId = `${table.id}:${table.cycle}`;
    waiting.chairId = chair.id;
    waiting.field = this.seatFields.get(chair.id)!;
    waiting.state = "to-seat";
    if (waiting.entranceQueuedAt !== null) {
      this.totalEntranceWaitSeconds += (this.metrics.time - waiting.entranceQueuedAt) * waiting.partySize;
      this.entranceWaitedPeople += waiting.partySize;
      waiting.entranceQueuedAt = null;
    }
  }

  /** ตำแหน่งและสถานะของลูกค้าทุกคน (id, x, y, stateCode) */
  agentBuffer(): Float32Array {
    const count = this.agents.reduce((sum, agent) => sum + agent.partySize, 0);
    const buffer = new Float32Array(count * AGENT_STRIDE);
    let i = 0;
    for (const agent of this.agents) {
      for (let member = 0; member < agent.partySize; member++) {
        const o = i++ * AGENT_STRIDE;
        const position = this.memberPosition(agent, member);
        buffer[o] = renderMemberId(agent.id, member);
        buffer[o + 1] = position.x;
        buffer[o + 2] = position.y;
        buffer[o + 3] = AGENT_STATE_CODE[agent.state];
      }
    }
    return buffer;
  }

  private partyView(agent: Agent): PartyView {
    return { id: agent.id, state: agent.state, partySize: agent.partySize, chairIds: [...agent.renderChairIds],
      tableId: agent.tableId ?? this.chairById.get(agent.chairId ?? "")?.tableId ?? null,
      cycleId: agent.serviceCycleId, speed: agent.speed, fedAt: agent.fedAt, placedAt: agent.placedAt, dineSeconds: agent.traits.dineSeconds, cancelled: agent.cancelled, entranceQueuedAt: agent.entranceQueuedAt, seatedAt: agent.seatedAt,
      tablePatienceSeconds: agent.tablePatienceSeconds, foodPatienceSeconds: agent.foodPatienceSeconds, dishCounts: agent.dishCounts };
  }

  /** Full metadata without advancing time, changing business state or drawing randomness. */
  presentationSnapshot(envelope: { runId: string; layoutRevision: string; sequence: number }): PresentationSnapshot {
    const taskView = (record: { task: StaffTask; startedAt: number; total: number; plan: StaffPlan | null; cycleId: string | null }): TaskView => ({
      id: record.task.id, kind: record.task.kind, tableId: record.task.tableId ?? record.task.agent?.tableId ?? null,
      cycleId: record.cycleId, startedAt: record.startedAt, total: record.total, plan: record.plan,
      party: record.task.agent ? this.partyView(record.task.agent) : null,
    });
    const parties = this.agents.map(agent => this.partyView(agent));
    return buildPresentationSnapshot(this.layout, {
      ...envelope, time: this.metrics.time, seed: this.config.seed, parties,
      tablePatienceSeconds: (this.config.tablePatienceMinutes ?? this.config.patienceMinutes) * 60,
      foodPatienceSeconds: this.config.patienceMinutes * 60,
      tables: [...this.tableById.values()].map(table => ({
        id: table.id, cycleId: this.tableService ? `${table.id}:${table.cycle}` : `counter:${table.id}`,
        status: this.tableService ? table.status : parties.some(party => party.tableId === table.id) ? "occupied" : "clean",
        cleanCompletedAt: table.cleanCompletedAt,
      })),
      departed: [...this.departed.values()], tasks: [...this.presentationTasks.values()].map(taskView),
      staff: this.frontStaff.map((staff, id) => {
        const record = [...this.presentationTasks.values()].find(record => record.task.id === staff.task?.id);
        const active = staff.task ? { task: staff.task, startedAt: staff.startedAt, total: staff.total, plan: staff.plan,
          cycleId: staff.task.agent?.serviceCycleId ?? record?.cycleId ?? null } : null;
        return { id, task: active ? taskView(active) : null, onBreak: !active && this.isStaffOnBreak(id, this.frontStaff.length) };
      }),
    });
  }

  /** สำเนาข้อมูลภายในสำหรับเทสต์ */
  debugAgents(): ReadonlyArray<Readonly<Pick<Agent, "id" | "state" | "x" | "y" | "chairId" | "tableId" | "partySize">>> {
    return this.agents.map(({ id, state, x, y, chairId, tableId, partySize }) => ({ id, state, x, y, chairId, tableId, partySize }));
  }

  /** ครัวอาจยังทำจานที่ยกเลิกไปแล้ว แม้ลูกค้าคนสุดท้ายออกจากร้าน */
  hasCancelledCooking(): boolean {
    return this.cooks.some((cook) => cook.task?.agent?.cancelled === true);
  }

  getMetrics(): SimulationMetrics {
    return { ...this.metrics };
  }
}
