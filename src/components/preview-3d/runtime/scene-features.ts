/**
 * feat-122 · Assembles the five implemented scene features and wires the ports between them.
 *
 * Each lane shipped a factory plus typed ports; nothing here reaches into a lane's internals. The
 * only cross-lane edges are the ones the contract allows:
 * - staff-actions reads table-service (is the dish on the table yet?)
 * - customer-actions reads table-service (where is the dish, really?) and seating (is the body
 *   actually seated, and where is it in the seating clip?)
 * - seating publishes `CustomerPosePort`, which is exactly what customer-actions pulls.
 *
 * The `food` slot stays a no-op: feat-103's catalogue is data that table-service renders, so adding
 * a second owner of the same dishes would give two features one bone channel.
 */
import type { SceneFeatureContext, SceneFeatureFactories } from "./contracts";
import { createCustomerActionsFeature, type CustomerActionsFeature } from "../customer-actions";
import { createSeatingFeature, type SeatingFeature } from "../seating";
import type { ChairRigPort } from "../seating/contracts";
import { createStaffActionsFeature, type StaffActionsFeature } from "../staff-actions";
import type { StaffRigPort } from "../staff-actions/contracts";
import type { CustomerRigPort } from "../customer-actions/contracts";
import { createTableServiceFeature, type TableServiceFeature, type TableServiceFeatureOptions } from "../table-service";
import {
  createSceneLightingFeature,
  type SceneLightingFeature,
  type SceneLightingFeatureOptions,
} from "../lighting/scene-lighting";

export interface SceneFeatureHost {
  readonly staffRigs: StaffRigPort;
  readonly customerRigs: CustomerRigPort;
  readonly chairRigs: ChairRigPort;
  /** prefers-reduced-motion, re-read each frame so a mid-session change is honoured. */
  readonly reducedMotion: () => boolean;
  readonly tableService?: TableServiceFeatureOptions;
  readonly lighting?: SceneLightingFeatureOptions;
}

export interface SceneFeatureHandles {
  factories: SceneFeatureFactories;
  /** Features resolved once the host has built them, for the host's own wiring and for QA. */
  tableService: TableServiceFeature | null;
  staffActions: StaffActionsFeature | null;
  customerActions: CustomerActionsFeature | null;
  seating: SeatingFeature | null;
  lighting: SceneLightingFeature | null;
}

/**
 * Builds the factory map. The handles object is filled in as the runtime constructs each feature,
 * in the order the host installs them (food → table → staff → customer → seating → lighting), so a
 * later feature can depend on an earlier one through its port.
 */
export function createSceneFeatureFactories(host: SceneFeatureHost): SceneFeatureHandles {
  const handles: SceneFeatureHandles = {
    factories: {},
    tableService: null, staffActions: null, customerActions: null, seating: null, lighting: null,
  };

  const factories: SceneFeatureFactories = {
    "table-service": (context: SceneFeatureContext) => {
      handles.tableService = createTableServiceFeature(context, host.tableService ?? {});
      return handles.tableService;
    },
    "staff-actions": (context: SceneFeatureContext) => {
      handles.staffActions = createStaffActionsFeature({
        rigs: host.staffRigs,
        // Resolved per call, because table-service is built one slot earlier in the same pass.
        tableService: {
          getDishPlacements: tableId => handles.tableService?.getDishPlacements(tableId) ?? [],
          getTableStainInfo: tableId => handles.tableService?.getTableStainInfo(tableId) ?? null,
        },
        reducedMotion: host.reducedMotion,
      })(context);
      return handles.staffActions;
    },
    "customer-actions": (context: SceneFeatureContext) => {
      handles.customerActions = createCustomerActionsFeature({
        rigs: host.customerRigs,
        tableService: { getDishPlacements: tableId => handles.tableService?.getDishPlacements(tableId) ?? [] },
        // Seating is installed after this slot, so the pose is always read through the handle.
        pose: { getSeatPose: renderAgentId => handles.seating?.getSeatPose(renderAgentId) ?? null },
        reducedMotion: host.reducedMotion,
      })(context);
      return handles.customerActions;
    },
    seating: (context: SceneFeatureContext) => {
      handles.seating = createSeatingFeature({ chairs: host.chairRigs, reducedMotion: host.reducedMotion })(context);
      return handles.seating;
    },
    lighting: (context: SceneFeatureContext) => {
      handles.lighting = createSceneLightingFeature(context, host.lighting ?? {});
      return handles.lighting;
    },
  };

  // The same object is returned, so each factory's assignment above is visible to the caller.
  handles.factories = factories;
  return handles;
}
