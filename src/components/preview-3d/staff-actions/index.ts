export {
  LEGACY_STAFF_CLIP_NAMES,
  STAFF_CLIP_NAMES,
  type ClipMarker,
  type LegacyStaffClipName,
  type StaffActionReport,
  type StaffActionsOptions,
  type StaffClipName,
  type StaffMarkerTable,
  type StaffRig,
  type StaffRigPort,
  type TableServicePort,
  type WipeFootprint,
} from "./contracts";
export {
  STANDING_SPEED_EPSILON,
  markerTime,
  phaseProgress,
  resolveClipName,
  resolveStaffAction,
  wipeReach,
  type StaffActionDecision,
  type StaffActionInput,
  type StaffActionTier,
  type StaffPropState,
} from "./staff-action-controller";
export {
  DEFAULT_WIPE_FOOTPRINT,
  createStaffActionsFeature,
  staffMarkerTimes,
  type StaffActionsFeature,
} from "./staff-actions";
