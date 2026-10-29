import { z } from "zod";
import { PRESENTATION_VERSION, type PresentationSnapshot } from "@/core/simulation/presentation-contract";

const id = z.string().min(1).max(240), number = z.number().finite(), integer = number.int().nonnegative();
const ratio = number.min(0).max(1), time = number.nonnegative(), nullableTime = time.nullable();
const point = z.object({ x: number, y: number });
const snapshotSchema = z.object({
  version: z.literal(PRESENTATION_VERSION), runId: id, layoutRevision: id, sequence: integer, simTimeSeconds: time,
  customers: z.array(z.object({ renderAgentId: integer, partyId: integer, memberIndex: integer.max(3), tableId: id.nullable(), chairId: id.nullable(), serviceCycleId: id.nullable(),
    activity: z.enum(["walking", "waiting-order", "waiting-food", "eating", "finished", "leaving"]), seatingPhase: z.enum(["approach", "pull", "sit", "push", "seated", "rise-pull", "rise", "depart"]).nullable(),
    walkMetersPerSecond: number.positive().max(10), mealId: id.nullable(), thought: z.object({ kind: z.enum(["queue-wait", "queue-warning", "queue-critical", "order-wait", "food-wait", "food-warning", "food-critical", "eating", "bill-wait"]), waitSeconds: number, severity: z.enum(["normal", "warning", "critical"]) }).nullable().optional() })).max(10000),
  meals: z.array(z.object({ mealId: id, ownerRenderAgentId: integer, tableId: id, chairId: id, serviceCycleId: id,
    foodKind: z.enum(["fried-rice", "noodles", "steak", "salad", "cake"]), anchor: point, progress: z.enum(["full", "partial", "empty"]), consumed: ratio, placedAtSeconds: nullableTime })).max(10000),
  tables: z.array(z.object({ tableId: id, serviceCycleId: id, availability: z.enum(["clean", "occupied", "dirty", "cleaning"]),
    surface: z.enum(["empty", "served", "eating", "used", "wiping", "clean"]), mealIds: z.array(id).max(100), stainAmount: ratio, wipeProgress: ratio, cleanCompletedAtSeconds: nullableTime })).max(10000),
  staff: z.array(z.object({ staffId: integer, taskId: id.nullable(), taskKind: z.enum(["deliver", "pay", "clean", "take-order"]).nullable(), tableId: id.nullable(), serviceCycleId: id.nullable(),
    activity: z.enum(["counter", "walking", "taking-order", "pickup", "carrying", "put-down", "wiping", "clearing"]), walkMetersPerSecond: number.positive().max(10),
    carryMealIds: z.array(id).max(100), servicePoint: point.nullable(), phaseStartedAtSeconds: time, phaseEndsAtSeconds: time, thought: z.object({ kind: z.enum(["taking-order", "serving", "cleaning"]) }).nullable().optional() })).max(100),
  milestones: z.array(z.object({ taskId: id, serviceCycleId: id, pickedUpAtSeconds: nullableTime, placedAtSeconds: nullableTime,
    wipeStartedAtSeconds: nullableTime, wipeFinishedAtSeconds: nullableTime, clearedAtSeconds: nullableTime, taskCompletedAtSeconds: time })).max(40000),
});

export function parsePresentation(value: unknown): PresentationSnapshot | null {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) return null;
  const data = result.data;
  const distinct = <T>(items: readonly T[], key: (value: T) => string | number) => new Set(items.map(key)).size === items.length;
  if (!distinct(data.customers, item => item.renderAgentId) || !distinct(data.tables, item => item.tableId) || !distinct(data.meals, item => item.mealId) || !distinct(data.staff, item => item.staffId)) return null;
  if (data.staff.some(item => item.phaseEndsAtSeconds < item.phaseStartedAtSeconds)) return null;
  const seated = data.customers.filter(customer => customer.seatingPhase === "seated");
  if (seated.some(customer => !customer.chairId || !customer.tableId || !customer.serviceCycleId) || !distinct(seated, customer => customer.chairId!)) return null;
  const cycles = new Map(data.tables.map(table => [table.tableId, table.serviceCycleId]));
  if (data.meals.some(meal => cycles.get(meal.tableId) !== meal.serviceCycleId)) return null;
  const meals = new Map(data.meals.map(meal => [meal.mealId, meal]));
  if (data.tables.some(table => table.mealIds.some(id => meals.get(id)?.tableId !== table.tableId))) return null;
  return data;
}

export interface PresentationMessage { runId?: string; sequence?: number; presentation?: unknown }

/** Per-START gate; legacy/unknown metadata never invents eating/cleaning state. */
export class PresentationBridge {
  private revision: string | null = null;
  private runId: string | null = null;
  private sequence = -1;
  private time = -1;
  private value: PresentationSnapshot | null = null;

  get current(): PresentationSnapshot | null { return this.value; }
  reset() { this.revision = null; this.runId = null; this.sequence = -1; this.time = -1; this.value = null; }

  begin(layoutRevision: string, initial: PresentationMessage = {}) {
    this.reset(); this.revision = layoutRevision;
    this.runId = initial.runId ?? null;
    if (initial.presentation) this.accept({ ...initial, sequence: initial.sequence ?? 0 });
  }

  accept(message: PresentationMessage): boolean {
    if (!this.revision) return false;
    const raw = message.presentation as { version?: unknown; runId?: unknown; layoutRevision?: unknown; sequence?: unknown } | null | undefined;
    const incomingRun = message.runId ?? (typeof raw?.runId === "string" ? raw.runId : undefined);
    if (this.runId && incomingRun !== this.runId) return false;
    if (raw?.layoutRevision !== undefined && raw.layoutRevision !== this.revision) return false;
    const sequence = message.sequence ?? raw?.sequence;
    if (incomingRun && (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0 || sequence <= this.sequence)) return false;
    if (raw?.runId !== undefined && raw.runId !== incomingRun) return false;
    if (raw?.sequence !== undefined && raw.sequence !== sequence) return false;
    const snapshot = raw?.version === PRESENTATION_VERSION ? parsePresentation(raw) : null;
    if (raw?.version === PRESENTATION_VERSION && !snapshot) return false;
    if (snapshot && snapshot.simTimeSeconds < this.time) return false;
    if (incomingRun) { this.runId = incomingRun; this.sequence = sequence as number; }
    if (snapshot) this.time = snapshot.simTimeSeconds;
    this.value = snapshot;
    return true;
  }
}
