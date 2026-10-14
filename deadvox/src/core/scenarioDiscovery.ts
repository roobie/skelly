import type { CityPlan } from './cityPlan.ts';
import type { Vec3 } from './coords.ts';
import { placedPieces } from './templates.ts';

export const DISCOVERY_EVENTS = [
  'clueRead',
  'landmarkArrival',
  'buildingArrival',
  'hatchEncounter',
  'hatchOpened',
  'entranceTravel',
] as const;
export type DiscoveryEvent = (typeof DISCOVERY_EVENTS)[number];
export type ScenarioDiscoveryState = Record<DiscoveryEvent, number | null>;
export const emptyDiscovery = (): ScenarioDiscoveryState => ({
  clueRead: null,
  landmarkArrival: null,
  buildingArrival: null,
  hatchEncounter: null,
  hatchOpened: null,
  entranceTravel: null,
});

export interface ScenarioDiscovery {
  clues: readonly Readonly<Vec3>[];
  landmarks: readonly { min: Readonly<Vec3>; max: Readonly<Vec3> }[];
  building: { min: Readonly<Vec3>; max: Readonly<Vec3> };
  entrance: { min: Readonly<Vec3>; max: Readonly<Vec3> };
}

export const discoveryForPlan = (plan: CityPlan): ScenarioDiscovery | undefined => {
  if (!(plan.service && plan.portal && plan.composition)) {
    return undefined;
  }
  const box = (origin: Readonly<Vec3>, size: Readonly<Vec3>) => ({
    min: origin,
    max: origin.map((value, axis) => value + size[axis]!) as Vec3,
  });
  const side = Math.max(plan.service.template.size[0], plan.service.template.size[2]);
  return {
    clues: plan.composition.leads.flatMap((placement) => placedPieces(placement).map(({ pos }) => pos)),
    landmarks: plan.composition.landmarks.map(({ origin, template }) => box(origin, template.size)),
    building: box([plan.service.origin[0], plan.floor, plan.service.origin[2]], [side, 4, side]),
    entrance: plan.portal.envelope,
  };
};

export const nearDiscoveryBox = (
  position: Readonly<Vec3>,
  box: { min: Readonly<Vec3>; max: Readonly<Vec3> },
  margin: number,
): boolean => position.every((value, axis) => value >= box.min[axis]! - margin && value <= box.max[axis]! + margin);
