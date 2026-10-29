/**
 * feat-118 · Types for the feat-110 clip provider, imported by this lane's tests only.
 *
 * The published values live in the provider so the clip and the runtime cannot drift apart. The
 * runtime re-implements them in TypeScript (`customer-action-controller.ts`) rather than importing
 * a build script, and the unit tests assert the two agree.
 */
declare module "*/character-clips/customer-eat.mjs" {
  export function eatPhaseOffset(seed: number, partyId: number, memberIndex: number): number;
  export function utensilGripOffset(food: string): number;
  export const EAT_UTENSILS: Record<string, { utensil: string; length: number }>;
  export const CUSTOMER_EAT_PROFILE: {
    seatTopY: number;
    tableSurfaceY: number;
    foodSurfaceY: number;
    plateForward: number;
    mouthLocal: readonly number[];
    tipReach: number;
    palmLocal: readonly number[];
    durations: Record<string, number>;
  };
}
