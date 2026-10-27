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
 * table-service: 0 = เดินไปจ่ายเงิน, 1 = รอคิวจ่าย, 2 = กำลังจ่าย
 */
export const AGENT_STATE_CODE: Record<AgentState, number> = {
  "waiting-entrance": 1,
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
export const STAFF_WALK_SPEED = 1.2;
/** เวลาทำแต่ละจานแกว่งรอบค่าที่ตั้ง ±20% */
export const COOK_TIME_SPREAD = 0.2;
/** ค่าเฉลี่ยของกลุ่มที่สุ่ม 1–4 คน = 2.5 คน ใช้แปลงคน/ชม. เป็นกลุ่ม/ชม. */
const MEAN_PARTY_SIZE = 2.5;

export interface PeakWindow {
  /** วินาทีนับจากเริ่มจำลอง (= เปิดร้าน) */
  startSeconds: number;
  endSeconds: number;
  customersPerHour: number;
}

export interface SimulationConfig {
  serviceStyle: ServiceStyle;
  /** ลูกค้าต่อชั่วโมงช่วงปกติ */
  customersPerHour: number;
  /** ช่วงคนเยอะ; null = อัตราเดียวทั้งวัน */
  peak: PeakWindow | null;
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
}

/** metrics เริ่มต้น (ค่า 0 ทั้งหมด) */
export function emptyMetrics(): SimulationMetrics {
  return {
    time: 0,
    arrived: 0,
    served: 0,
    noSeat: 0,
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
  };
}

type StaffTaskKind = "deliver" | "pay" | "clean" | "take-order";

interface StaffTask {
  kind: StaffTaskKind;
  agent: Agent | null;
  tableId: string | null;
  createdAt: number;
}

interface Worker {
  /** วินาทีที่เหลือของงานปัจจุบัน; 0 = ว่าง */
  remaining: number;
  task: StaffTask | null;
}

interface Agent {
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
  entranceQueuedAt: number | null;
  enteredAt: number;
  seatedAt: number;
  /** ลักษณะเฉพาะคน สุ่มตอนเข้าร้าน (วินาที; cookFactor = ตัวคูณเวลาทำจาน) */
  traits: { orderSeconds: number; dineSeconds: number; takeOrderSeconds: number; paySeconds: number; cookFactor: number };
}

type TableStatus = "clean" | "occupied" | "dirty" | "cleaning";

interface RuntimeTable {
  id: string;
  chairIds: readonly string[];
  status: TableStatus;
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
  readonly grid: OccupancyGrid;
  readonly counterCount: number;
  readonly counterField: FlowField;
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
  return { grid, counterCount: counters.length, counterField, exitField, chairs, tables, seatFields, takeOrderWalk, deliverWalk };
}

export class Simulation {
  readonly grid: OccupancyGrid;
  readonly heatmap: Float32Array;
  private readonly config: SimulationConfig;
  /** สุ่มลูกค้า (การมาถึงและลักษณะเฉพาะคน) */
  private readonly random: () => number;
  /** สุ่มอื่น ๆ ที่ขึ้นกับสถานะร้าน (เลือกเก้าอี้) */
  private readonly seatRandom: () => number;
  private readonly counterField: FlowField;
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
  private readonly cooks: Worker[];
  private readonly staffTasks: StaffTask[] = [];
  private readonly queuedCleanTables = new Set<string>();
  private readonly kitchenOrders: Agent[] = [];
  private agents: Agent[] = [];
  private nextId = 1;
  private nextArrival: number;
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
    this.seatRandom = mulberry32(this.config.seed ^ 0x5bd1e995);
    const prepared = "grid" in store ? store : prepareStore(store);
    this.grid = prepared.grid;
    this.heatmap = new Float32Array(this.grid.cells.length);
    this.counterField = prepared.counterField;
    this.exitField = prepared.exitField;
    this.chairs = prepared.chairs;
    for (const chair of this.chairs) this.chairById.set(chair.id, chair);
    for (const table of prepared.tables) {
      const chairIds = table.chairIds.filter((id) => this.chairById.has(id));
      if (chairIds.length > 0) this.tableById.set(table.id, { id: table.id, chairIds, status: "clean" });
    }
    this.seatFields = prepared.seatFields;
    this.takeOrderWalk = prepared.takeOrderWalk;
    this.deliverWalk = prepared.deliverWalk;
    this.servingSlots = Math.max(1, prepared.counterCount * this.config.servingSlotsPerCounter);

    const team = (n: number): Worker[] => Array.from({ length: Math.max(1, Math.floor(n)) }, () => ({ remaining: 0, task: null }));
    this.frontStaff = team(this.config.frontStaff);
    this.cooks = team(this.config.cooks);

    this.maxPartyRate =
      Math.max(this.config.customersPerHour, this.config.peak?.customersPerHour ?? 0) / (this.tableService ? MEAN_PARTY_SIZE : 1);
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
    const { peak, closeSeconds } = this.config;
    if (closeSeconds !== null && t >= closeSeconds) return 0;
    if (peak && t >= peak.startSeconds && t < peak.endSeconds) return peak.customersPerHour;
    return this.config.customersPerHour;
  }

  private partyRateAt(t: number) {
    return this.tableService ? this.rateAt(t) / MEAN_PARTY_SIZE : this.rateAt(t);
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
    const agent: Agent = {
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
      entranceQueuedAt: null,
      enteredAt: this.metrics.time,
      seatedAt: 0,
      traits: {
        orderSeconds: this.between(this.config.orderSeconds),
        dineSeconds: this.between(this.config.dineMinutes) * 60,
        takeOrderSeconds: this.between(this.config.takeOrderSeconds),
        paySeconds: this.between(this.config.paySeconds),
        cookFactor: spread,
      },
    };
    this.agents.push(agent);
    this.metrics.arrived += agent.partySize;
    // ร้านอาหาร: ไม่มีโต๊ะสะอาดที่พอสำหรับทั้งกลุ่ม ให้ยืนรอที่ทางเข้า
    if (this.tableService && !this.goToChair(agent)) {
      agent.field = null;
      agent.state = "waiting-entrance";
      agent.entranceQueuedAt = this.metrics.time;
    }
  }

  /** สุ่มจำนวนคนในกลุ่ม 1–4 คน (Agent หนึ่งตัวแทนหนึ่งกลุ่ม) */
  private partySize() {
    return this.tableService ? 1 + Math.floor(this.random() * 4) : 1;
  }

  /** จองโต๊ะสะอาดที่รองรับทั้งกลุ่ม แล้วให้ leader เดินไปยังเก้าอี้ตัวแรก */
  private goToChair(agent: Agent): boolean {
    if (!this.tableService) {
      const chair = this.pickChair();
      if (!chair) return false;
      this.occupiedChairs.add(chair.id);
      agent.chairId = chair.id;
      agent.field = this.seatFields.get(chair.id)!;
      agent.state = "to-seat";
      return true;
    }
    const table = this.pickTable(agent.partySize);
    if (!table) return false;
    const chair = this.chairById.get(table.chairIds[0]!)!;
    table.status = "occupied";
    for (const chairId of table.chairIds) this.occupiedChairs.add(chairId);
    agent.tableId = table.id;
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

  private pickTable(partySize: number): RuntimeTable | null {
    const free = [...this.tableById.values()].filter((table) => table.status === "clean" && table.chairIds.length >= partySize);
    return free.length === 0 ? null : free[Math.floor(this.seatRandom() * free.length)]!;
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
  }

  /** ลุกจากเก้าอี้ ออกมายืนที่ช่องว่างข้างเก้าอี้ */
  private standUp(agent: Agent) {
    if (!this.tableService) this.occupiedChairs.delete(agent.chairId!);
    const field = this.seatFields.get(agent.chairId!)!;
    const chair = this.chairById.get(agent.chairId!)!;
    const standCell = touchingCells(this.grid, footprint(chair)).find((c) => field.distance[c] === 0);
    if (standCell !== undefined) Object.assign(agent, this.cellCenter(standCell));
  }

  private leave(agent: Agent) {
    agent.field = this.exitField;
    agent.state = "leaving";
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
          break;
        case "to-counter":
          if (this.walk(agent, dt)) {
            agent.state = "queuing";
            if (this.tableService) this.addTask("pay", agent);
          }
          break;
        case "queuing":
        case "waiting-order":
        case "waiting-food":
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

    // ออกจากร้านเมื่อถึงประตู
    this.agents = this.agents.filter((agent) => {
      if (agent.state === "leaving" && this.exitField.distance[this.cellOf(agent.x, agent.y)] === 0) {
        if (this.tableService && agent.tableId) this.markTableDirty(agent.tableId);
        if (!this.tableService || agent.seatedAt > 0) {
          this.left += agent.partySize;
          this.totalVisitSeconds += (this.metrics.time - agent.enteredAt) * agent.partySize;
        }
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
      if (code !== 4 && agent.state !== "ordering") this.heatmap[this.cellOf(agent.x, agent.y)]! += dt;
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
    this.staffTasks.push({ kind, agent, tableId: null, createdAt: this.metrics.time });
  }

  private markTableDirty(tableId: string) {
    const table = this.tableById.get(tableId);
    if (!table || table.status !== "occupied") return;
    table.status = "dirty";
    for (const chairId of table.chairIds) this.occupiedChairs.delete(chairId);
    if (!this.queuedCleanTables.has(tableId)) {
      this.queuedCleanTables.add(tableId);
      this.staffTasks.push({ kind: "clean", agent: null, tableId, createdAt: this.metrics.time });
    }
  }

  /** เดินเวลางานของพนักงานหน้าร้านและพ่อครัว แล้วแจกงานใหม่ให้คนที่ว่าง */
  private advanceStaff(dt: number) {
    for (const cook of this.cooks) {
      if (!cook.task) continue;
      this.kitchenBusySeconds += dt;
      cook.remaining -= dt;
      if (cook.remaining <= 0) {
        this.addTask("deliver", cook.task.agent!);
        cook.task = null;
      }
    }
    for (const staff of this.frontStaff) {
      if (!staff.task) continue;
      this.frontBusySeconds += dt;
      staff.remaining -= dt;
      if (staff.remaining <= 0) {
        this.finishTask(staff.task);
        staff.task = null;
      }
    }

    for (const cook of this.cooks) {
      if (cook.task || this.kitchenOrders.length === 0) continue;
      const agent = this.kitchenOrders.shift()!;
      cook.task = { kind: "deliver", agent, tableId: null, createdAt: this.metrics.time };
      cook.remaining = this.config.cookMinutesPerDish * 60 * agent.traits.cookFactor;
    }

    if (this.staffTasks.length === 0) return;
    this.staffTasks.sort((a, b) => this.taskPriority(a) - this.taskPriority(b) || a.createdAt - b.createdAt);
    for (const staff of this.frontStaff) {
      if (staff.task || this.staffTasks.length === 0) continue;
      const task = this.staffTasks.shift()!;
      staff.task = task;
      staff.remaining = this.taskSeconds(task);
      if (task.kind === "pay" && task.agent) task.agent.state = "ordering";
      if (task.kind === "clean" && task.tableId) this.tableById.get(task.tableId)!.status = "cleaning";
    }
  }

  private taskSeconds(task: StaffTask): number {
    const chairId = task.agent?.chairId;
    switch (task.kind) {
      case "take-order":
        return (this.takeOrderWalk.get(chairId!) ?? 0) + task.agent!.traits.takeOrderSeconds;
      case "deliver":
        return this.deliverWalk.get(chairId!) ?? 0;
      case "pay":
        return task.agent!.traits.paySeconds;
      case "clean": {
        const chairId = this.tableById.get(task.tableId!)!.chairIds[0]!;
        return (this.takeOrderWalk.get(chairId) ?? 0) + this.between(this.config.cleanTableSeconds);
      }
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
        agent!.state = "waiting-food";
        this.kitchenOrders.push(agent!);
        break;
      case "deliver": {
        const wait = this.metrics.time - agent!.seatedAt;
        this.metrics.fed += agent!.partySize;
        this.totalFoodWaitSeconds += wait * agent!.partySize;
        if (wait > this.config.patienceMinutes * 60) this.metrics.waitedTooLong += agent!.partySize;
        agent!.timer = agent!.traits.dineSeconds;
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
    for (const chairId of table.chairIds) this.occupiedChairs.add(chairId);
    const chair = this.chairById.get(table.chairIds[0]!)!;
    waiting.tableId = table.id;
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
    const buffer = new Float32Array(this.agents.length * AGENT_STRIDE);
    this.agents.forEach((a, i) => {
      const o = i * AGENT_STRIDE;
      buffer[o] = a.id;
      buffer[o + 1] = a.x + a.jitter.x;
      buffer[o + 2] = a.y + a.jitter.y;
      buffer[o + 3] = AGENT_STATE_CODE[a.state];
    });
    return buffer;
  }

  /** สำเนาข้อมูลภายในสำหรับเทสต์ */
  debugAgents(): ReadonlyArray<Readonly<Pick<Agent, "id" | "state" | "x" | "y" | "chairId" | "tableId" | "partySize">>> {
    return this.agents.map(({ id, state, x, y, chairId, tableId, partySize }) => ({ id, state, x, y, chairId, tableId, partySize }));
  }

  getMetrics(): SimulationMetrics {
    return { ...this.metrics };
  }
}
