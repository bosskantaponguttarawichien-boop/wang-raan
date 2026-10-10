/**
 * P2 Customer Flow Simulation — Pure TypeScript (รันใน Web Worker)
 *
 * วงจรลูกค้า: เข้าทางประตู → เดินไปเคาน์เตอร์ → (รอคิวถ้าช่องสั่งเต็ม) → สั่ง/จ่าย
 *            → เดินไปเก้าอี้ว่าง → นั่งทาน → เดินออกทางประตู
 * - เดินตาม Flow Field บน Occupancy Grid 0.25 ม. จึงไม่ทะลุสิ่งกีดขวาง
 * - สุ่มด้วย seed (mulberry32) เพื่อให้ผลซ้ำได้และทดสอบได้
 * - Heatmap สะสมเวลาที่ลูกค้า "เดินหรือรอคิว" อยู่ในแต่ละช่อง (ไม่นับเวลานั่ง)
 */
import { footprint, objectCenter } from "../layout/geometry";
import type { Chair, Point, Rect, StoreLayout } from "../layout/types";
import { computeFlowField, type FlowField } from "./flow-field";
import { CELL_FREE, buildOccupancyGrid, type OccupancyGrid } from "./occupancy-grid";

export type AgentState = "to-counter" | "queuing" | "ordering" | "to-seat" | "seated" | "leaving";

/** รหัสสถานะใน buffer ที่ส่งข้าม thread */
export const AGENT_STATE_CODE: Record<AgentState, number> = {
  "to-counter": 0,
  queuing: 1,
  ordering: 2,
  "to-seat": 3,
  seated: 4,
  leaving: 5,
};

/** ค่าต่อ agent ใน buffer: id, x, y, stateCode */
export const AGENT_STRIDE = 4;

export interface SimulationConfig {
  customersPerHour: number;
  seed: number;
  /** วินาที (สุ่มในช่วง) */
  orderSeconds: [number, number];
  /** นาที (สุ่มในช่วง) */
  dineMinutes: [number, number];
  /** เมตร/วินาที (สุ่มในช่วง) */
  walkSpeed: [number, number];
  /** จำนวนคนที่สั่งที่เคาน์เตอร์พร้อมกันได้ต่อเคาน์เตอร์ */
  servingSlotsPerCounter: number;
}

/** ค่าตั้งต้น — ยืนยันโดยเจ้าของผลิตภัณฑ์ 2026-10-10 (PRD §9 ข้อ 8, feat-034) */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  customersPerHour: 40,
  seed: 1,
  orderSeconds: [30, 90],
  dineMinutes: [15, 40],
  walkSpeed: [1.0, 1.4],
  servingSlotsPerCounter: 2,
};

export interface SimulationMetrics {
  /** เวลาจำลอง (วินาที) */
  time: number;
  arrived: number;
  served: number;
  /** มาแล้วไม่มีที่นั่ง (สั่งกลับบ้าน) */
  noSeat: number;
  inStore: number;
  queuing: number;
  seated: number;
  maxQueue: number;
  /** เวลาเฉลี่ยตั้งแต่เข้าจนออก (นาที) ของคนที่ออกแล้ว */
  avgVisitMinutes: number;
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
  enteredAt: number;
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

export class Simulation {
  readonly grid: OccupancyGrid;
  readonly heatmap: Float32Array;
  private readonly config: SimulationConfig;
  private readonly random: () => number;
  private readonly counterField: FlowField;
  private readonly exitField: FlowField;
  private readonly seatFields = new Map<string, FlowField>();
  private readonly chairs: Chair[];
  private readonly occupiedChairs = new Set<string>();
  private readonly servingSlots: number;
  private agents: Agent[] = [];
  private nextId = 1;
  private nextArrival: number;
  private metrics: SimulationMetrics = {
    time: 0,
    arrived: 0,
    served: 0,
    noSeat: 0,
    inStore: 0,
    queuing: 0,
    seated: 0,
    maxQueue: 0,
    avgVisitMinutes: 0,
  };
  private totalVisitSeconds = 0;
  private left = 0;

  constructor(layout: StoreLayout, config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    this.random = mulberry32(this.config.seed);
    this.grid = buildOccupancyGrid(layout);
    this.heatmap = new Float32Array(this.grid.cells.length);

    const counters = layout.objects.filter((o) => o.type === "counter");
    this.counterField = computeFlowField(this.grid, counters.flatMap((c) => touchingCells(this.grid, footprint(c))));
    this.exitField = computeFlowField(this.grid, this.grid.entranceCells);
    this.servingSlots = Math.max(1, counters.length * this.config.servingSlotsPerCounter);

    // เก้าอี้ที่ลูกค้าเดินไปถึงได้จากทางเข้าเท่านั้น
    this.chairs = layout.objects
      .filter((o): o is Chair => o.type === "chair")
      .filter((chair) => {
        const field = computeFlowField(this.grid, touchingCells(this.grid, footprint(chair)));
        const reachable = this.grid.entranceCells.some((cell) => Number.isFinite(field.distance[cell]!));
        if (reachable) this.seatFields.set(chair.id, field);
        return reachable;
      });

    this.nextArrival = this.sampleArrivalGap();
  }

  get seatCount() {
    return this.chairs.length;
  }

  private between([min, max]: [number, number]) {
    return min + this.random() * (max - min);
  }

  private sampleArrivalGap(): number {
    const rate = Math.max(1e-6, this.config.customersPerHour / 3600);
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
    this.agents.push({
      id: this.nextId++,
      state: "to-counter",
      x: p.x,
      y: p.y,
      speed: this.between(this.config.walkSpeed),
      jitter: { x: (this.random() - 0.5) * 0.1, y: (this.random() - 0.5) * 0.1 },
      field: this.counterField,
      timer: 0,
      chairId: null,
      enteredAt: this.metrics.time,
    });
    this.metrics.arrived++;
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

  private pickChair(): Chair | null {
    const free = this.chairs.filter((c) => !this.occupiedChairs.has(c.id));
    return free.length === 0 ? null : free[Math.floor(this.random() * free.length)]!;
  }

  step(dt: number) {
    // แบ่งเป็นช่วงย่อยไม่เกิน 0.25 วินาที เพื่อไม่ให้ก้าวข้ามช่อง
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(0.25, remaining);
      this.advance(h);
      remaining -= h;
    }
  }

  private advance(dt: number) {
    this.metrics.time += dt;
    this.nextArrival -= dt;
    while (this.nextArrival <= 0) {
      this.spawn();
      this.nextArrival += this.sampleArrivalGap();
    }

    const ordering = this.agents.filter((a) => a.state === "ordering").length;
    let freeSlots = this.servingSlots - ordering;

    for (const agent of this.agents) {
      switch (agent.state) {
        case "to-counter":
          if (this.walk(agent, dt)) agent.state = "queuing";
          break;
        case "queuing":
          break;
        case "ordering":
          agent.timer -= dt;
          if (agent.timer <= 0) {
            const chair = this.pickChair();
            if (chair) {
              this.occupiedChairs.add(chair.id);
              agent.chairId = chair.id;
              agent.field = this.seatFields.get(chair.id)!;
              agent.state = "to-seat";
            } else {
              this.metrics.noSeat++;
              agent.field = this.exitField;
              agent.state = "leaving";
            }
          }
          break;
        case "to-seat":
          if (this.walk(agent, dt)) {
            const chair = this.chairs.find((c) => c.id === agent.chairId)!;
            const center = objectCenter(chair);
            agent.x = center.x;
            agent.y = center.y;
            agent.jitter = { x: 0, y: 0 };
            agent.timer = this.between(this.config.dineMinutes) * 60;
            agent.state = "seated";
          }
          break;
        case "seated":
          agent.timer -= dt;
          if (agent.timer <= 0) {
            this.occupiedChairs.delete(agent.chairId!);
            // ลุกออกมายืนที่ช่องว่างข้างเก้าอี้ก่อนเดินออก
            const field = this.seatFields.get(agent.chairId!)!;
            const chair = this.chairs.find((c) => c.id === agent.chairId)!;
            const standCell = touchingCells(this.grid, footprint(chair)).find((c) => field.distance[c] === 0);
            if (standCell !== undefined) Object.assign(agent, this.cellCenter(standCell));
            agent.chairId = null;
            agent.field = this.exitField;
            agent.state = "leaving";
            this.metrics.served++;
          }
          break;
        case "leaving":
          this.walk(agent, dt); // ออกจากร้านเมื่อถึงประตู (ตรวจด้านล่าง)
          break;
      }
    }

    // เรียกคิวตามลำดับการมาถึง
    for (const agent of this.agents) {
      if (freeSlots <= 0) break;
      if (agent.state === "queuing") {
        agent.state = "ordering";
        agent.timer = this.between(this.config.orderSeconds);
        freeSlots--;
      }
    }

    // ออกจากร้านเมื่อถึงประตู
    this.agents = this.agents.filter((agent) => {
      if (agent.state === "leaving" && this.exitField.distance[this.cellOf(agent.x, agent.y)] === 0) {
        this.left++;
        this.totalVisitSeconds += this.metrics.time - agent.enteredAt;
        return false;
      }
      return true;
    });

    let queuing = 0;
    let seated = 0;
    for (const agent of this.agents) {
      if (agent.state === "queuing") queuing++;
      if (agent.state === "seated") seated++;
      if (agent.state !== "seated" && agent.state !== "ordering") this.heatmap[this.cellOf(agent.x, agent.y)]! += dt;
    }
    this.metrics.inStore = this.agents.length;
    this.metrics.queuing = queuing;
    this.metrics.seated = seated;
    this.metrics.maxQueue = Math.max(this.metrics.maxQueue, queuing);
    this.metrics.avgVisitMinutes = this.left > 0 ? this.totalVisitSeconds / this.left / 60 : 0;
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
  debugAgents(): ReadonlyArray<Readonly<Pick<Agent, "id" | "state" | "x" | "y" | "chairId">>> {
    return this.agents.map(({ id, state, x, y, chairId }) => ({ id, state, x, y, chairId }));
  }

  getMetrics(): SimulationMetrics {
    return { ...this.metrics };
  }
}
