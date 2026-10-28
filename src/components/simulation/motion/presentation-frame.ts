import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";

/** Gate semantic actions on the displayed pose, while preserving authoritative table cycles. */
export function alignPresentation(snapshot: PresentationSnapshot, agents: Float32Array, staff: Float32Array): PresentationSnapshot {
  const seated = new Set<number>();
  for (let offset = 0; offset < agents.length; offset += 4) if (agents[offset + 3] === 4) seated.add(agents[offset]!);
  const positions = new Map<number, { x: number; y: number; code: number }>();
  for (let offset = 0; offset < staff.length; offset += 4) positions.set(staff[offset]!, { x: staff[offset + 1]!, y: staff[offset + 2]!, code: staff[offset + 3]! });
  return {
    ...snapshot,
    customers: snapshot.customers.map(customer => seated.has(customer.renderAgentId) || customer.seatingPhase !== "seated" ? customer : {
      ...customer, seatingPhase: "approach", activity: customer.activity === "eating" ? "waiting-food" : customer.activity,
    }),
    staff: snapshot.staff.map(member => {
      const position = positions.get(member.staffId);
      if (position?.code === 5) return { ...member, activity: "pickup", carryMealIds: [] };
      if (position && member.servicePoint && Math.hypot(position.x - member.servicePoint.x, position.y - member.servicePoint.y) > 0.12 && ["wiping", "put-down", "taking-order"].includes(member.activity)) {
        return { ...member, activity: position.code === 3 ? "carrying" : "walking" };
      }
      return member;
    }),
  };
}
