export {
  type ChairRig,
  type ChairRigPort,
  type CustomerSeatPose,
  type SeatBodyPlacement,
  type SeatingOptions,
  type SeatingReport,
} from "./contracts";
export {
  CHAIR_BACK_CLEARANCE,
  chairAxes,
  chairFacing,
  chairPullSpace,
  chairSlideSeconds,
  offsetAlongOutward,
  type ChairAxes,
  type ChairPullSpace,
} from "./seating-geometry";
export {
  advanceSeatSequence,
  createSeatSequence,
  describeSeatSequence,
  isSequenceIdle,
  phaseSeconds,
  pullChairTravel,
  type SeatIntent,
  type SeatSequenceOptions,
  type SeatSequencePhase,
  type SeatSequenceState,
} from "./seat-sequence";
export { chairCenter, createSeatingFeature, type SeatingFeature } from "./seating";
