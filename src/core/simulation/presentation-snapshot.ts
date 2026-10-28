import { objectCenter } from "../layout/geometry";
import type { Chair, StoreLayout, Table } from "../layout/types";
import type { AgentState } from "./engine";
import type { StaffPlan, StaffTaskKind } from "./staff-visual";
import { STAFF_STATE_CODE } from "./staff-visual";
import { PRESENTATION_VERSION, type CustomerActivity, type FoodKind, type MealPresentation, type PresentationSnapshot, type ServiceMilestones, type StaffPresentation, type TableAvailability } from "./presentation-contract";

export interface PartyView {
  id: number;
  state: AgentState;
  partySize: number;
  chairIds: readonly string[];
  tableId: string | null;
  cycleId: string | null;
  speed: number;
  fedAt: number | null;
  placedAt: number | null;
  dineSeconds: number;
  cancelled: boolean;
}
export interface TableView { id: string; cycleId: string; status: TableAvailability; cleanCompletedAt: number | null }
export interface TaskView {
  id: string;
  kind: StaffTaskKind;
  tableId: string | null;
  cycleId: string | null;
  startedAt: number;
  total: number;
  plan: StaffPlan | null;
  party: PartyView | null;
}
export interface StaffView { id: number; task: TaskView | null }
export interface SnapshotInput {
  runId: string;
  layoutRevision: string;
  sequence: number;
  time: number;
  seed: number;
  parties: readonly PartyView[];
  tables: readonly TableView[];
  /** Last departed party per table; replaced on the next allocation. */
  departed: readonly PartyView[];
  /** At most one task per table/kind, rather than a growing event log. */
  tasks: readonly TaskView[];
  staff: readonly StaffView[];
}

export const renderMemberId = (partyId: number, member: number) => partyId * 10 + member;
const FOOD_KINDS: readonly FoodKind[] = ["fried-rice", "noodles", "steak", "salad", "cake"];
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Independent hash: never draws from the simulation's random stream. */
export function foodKindFor(seed: number, partyId: number, member: number): FoodKind {
  let h = Math.imul(seed ^ partyId, 0x45d9f3b) ^ Math.imul(member + 1, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return FOOD_KINDS[(h >>> 0) % FOOD_KINDS.length]!;
}

export function taskMilestones(task: TaskView): ServiceMilestones {
  let time = task.startedAt;
  let pickup: number | null = null, placed: number | null = null, wipeStart: number | null = null, wipeEnd: number | null = null;
  for (const phase of task.plan?.phases ?? []) {
    if (phase.code === STAFF_STATE_CODE.serving) { pickup ??= time; placed = time + phase.seconds; }
    if (phase.code === STAFF_STATE_CODE.cleaning) { wipeStart ??= time; wipeEnd = time + phase.seconds; }
    time += phase.seconds;
  }
  const end = task.startedAt + task.total;
  return {
    taskId: task.id, serviceCycleId: task.cycleId ?? "",
    pickedUpAtSeconds: task.kind === "deliver" ? pickup ?? task.startedAt : null,
    placedAtSeconds: task.kind === "deliver" ? Math.min(end, placed ?? end) : null,
    wipeStartedAtSeconds: task.kind === "clean" ? wipeStart ?? task.startedAt : null,
    wipeFinishedAtSeconds: task.kind === "clean" ? Math.min(end, wipeEnd ?? end) : null,
    clearedAtSeconds: task.kind === "clean" ? end : null,
    taskCompletedAtSeconds: end,
  };
}

function activity(party: PartyView): CustomerActivity {
  if (party.cancelled || party.state === "leaving") return "leaving";
  if (party.state === "waiting-order" || party.state === "waiting-food") return party.state;
  if (party.state === "seated") return "eating";
  if (party.fedAt !== null) return "finished";
  return "walking";
}

function staffPresentation(staff: StaffView, now: number, meals: readonly MealPresentation[]): StaffPresentation {
  const task = staff.task;
  let current: StaffPresentation["activity"] = "counter";
  let start = task?.startedAt ?? now, end = task ? start + task.total : now;
  let servicePoint: { x: number; y: number } | null = null;
  if (task) {
    let cursor = task.startedAt;
    for (const phase of task.plan?.phases ?? []) {
      if (now < cursor + phase.seconds) {
        start = cursor; end = cursor + phase.seconds;
        current = phase.activity ?? (phase.code === STAFF_STATE_CODE.serving ? "carrying" : phase.code === STAFF_STATE_CODE.cleaning ? "wiping" : phase.code === STAFF_STATE_CODE["taking-order"] ? "taking-order" : phase.code === STAFF_STATE_CODE.walking ? "walking" : "counter");
        if (phase.points.length === 1) servicePoint = { ...phase.points[0]! };
        break;
      }
      cursor += phase.seconds;
    }
    if (task.party?.cancelled && current === "carrying") current = "walking";
  }
  return {
    staffId: staff.id, taskId: task?.id ?? null, taskKind: task?.kind ?? null,
    tableId: task?.tableId ?? null, serviceCycleId: task?.cycleId ?? null, activity: current,
    walkMetersPerSecond: 1.2,
    carryMealIds: current === "carrying" ? meals.filter(meal => meal.serviceCycleId === task?.cycleId).map(meal => meal.mealId) : [],
    servicePoint, phaseStartedAtSeconds: start, phaseEndsAtSeconds: end,
  };
}

/** Fresh, fully reconstructible DTOs; layout objects and engine state are never mutated. */
export function buildPresentationSnapshot(layout: StoreLayout, input: SnapshotInput): PresentationSnapshot {
  const chairs = new Map(layout.objects.filter((o): o is Chair => o.type === "chair").map(chair => [chair.id, chair]));
  const tables = new Map(layout.objects.filter((o): o is Table => o.type === "table").map(table => [table.id, table]));
  const cycles = new Map(input.tables.map(table => [table.id, table.cycleId]));
  const validTasks = input.tasks.filter(task => task.cycleId && cycles.get(task.tableId ?? "") === task.cycleId && !(task.party?.cancelled && task.kind === "deliver"));
  const milestones = validTasks.map(taskMilestones);
  const meals: MealPresentation[] = [];
  const parties = new Map([...input.departed, ...input.parties].map(party => [party.id, party]));
  for (const party of parties.values()) {
    if (!party.tableId || !party.cycleId || cycles.get(party.tableId) !== party.cycleId) continue;
    const table = tables.get(party.tableId);
    const tableState = input.tables.find(item => item.id === party.tableId);
    if (!table || tableState?.status === "clean") continue;
    const delivery = validTasks.find(task => task.kind === "deliver" && task.party?.id === party.id);
    if (party.fedAt === null && party.placedAt === null && (!delivery || party.cancelled)) continue;
    const placed = party.placedAt ?? (delivery ? taskMilestones(delivery).placedAtSeconds : party.fedAt);
    const consumed = party.fedAt === null ? 0 : clamp((input.time - party.fedAt) / Math.max(0.001, party.dineSeconds));
    for (let member = 0; member < party.partySize; member++) {
      const chair = chairs.get(party.chairIds[member] ?? "");
      if (!chair) continue;
      const center = objectCenter(chair), middle = objectCenter(table);
      const angle = -table.rotation * Math.PI / 180;
      const dx = center.x - middle.x, dy = center.y - middle.y;
      const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) * 0.5;
      const y = (dx * Math.sin(angle) + dy * Math.cos(angle)) * 0.5;
      meals.push({
        mealId: `${party.cycleId}:meal:${renderMemberId(party.id, member)}`,
        ownerRenderAgentId: renderMemberId(party.id, member), tableId: table.id, chairId: chair.id,
        serviceCycleId: party.cycleId, foodKind: foodKindFor(input.seed, party.id, member),
        anchor: { x: Math.max(-table.width / 2 + 0.13, Math.min(table.width / 2 - 0.13, x)), y: Math.max(-table.depth / 2 + 0.13, Math.min(table.depth / 2 - 0.13, y)) },
        consumed, progress: consumed >= 1 ? "empty" : consumed > 0 ? "partial" : "full",
        placedAtSeconds: placed !== null && placed <= input.time ? placed : null,
      });
    }
  }
  const customers = input.parties.flatMap(party => Array.from({ length: party.partySize }, (_, member) => {
    const id = renderMemberId(party.id, member);
    const seated = party.state === "seated" || party.state === "waiting-order" || party.state === "waiting-food";
    return {
      renderAgentId: id, partyId: party.id, memberIndex: member, tableId: party.tableId,
      chairId: party.chairIds[member] ?? null, serviceCycleId: party.cycleId,
      activity: activity(party), seatingPhase: seated ? "seated" as const : party.state === "to-seat" ? "approach" as const : party.fedAt !== null ? "depart" as const : null,
      walkMetersPerSecond: party.speed, mealId: meals.find(meal => meal.ownerRenderAgentId === id)?.mealId ?? null,
    };
  }));
  return {
    version: PRESENTATION_VERSION, runId: input.runId, layoutRevision: input.layoutRevision, sequence: input.sequence, simTimeSeconds: input.time,
    customers, meals, milestones,
    tables: input.tables.map(table => {
      const ownMeals = meals.filter(meal => meal.tableId === table.id && meal.placedAtSeconds !== null);
      const cleaning = validTasks.find(task => task.kind === "clean" && task.tableId === table.id);
      const timing = cleaning ? taskMilestones(cleaning) : null;
      const progress = timing?.wipeStartedAtSeconds !== null && timing?.wipeStartedAtSeconds !== undefined && timing.wipeFinishedAtSeconds !== null ? clamp((input.time - timing.wipeStartedAtSeconds) / Math.max(0.001, timing.wipeFinishedAtSeconds - timing.wipeStartedAtSeconds)) : 0;
      // Keep a residual until authoritative completion, including the walk back.
      const stain = ownMeals.reduce((max, meal) => Math.max(max, meal.consumed), 0) * (1 - progress * 0.98);
      return { tableId: table.id, serviceCycleId: table.cycleId, availability: table.status,
        surface: table.status === "clean" ? "clean" as const : table.status === "cleaning" ? "wiping" as const : table.status === "dirty" ? "used" as const : ownMeals.some(meal => meal.consumed > 0) ? "eating" as const : ownMeals.length ? "served" as const : "empty" as const,
        mealIds: ownMeals.map(meal => meal.mealId), stainAmount: stain, wipeProgress: table.status === "clean" ? 1 : progress, cleanCompletedAtSeconds: table.cleanCompletedAt };
    }),
    staff: input.staff.map(staff => staffPresentation(staff, input.time, meals)),
  };
}
