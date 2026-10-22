import type { CityPlan } from './cityPlan.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { furnitureSurfacePosition } from './furnitureSurface.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from './stairFlight.ts';
import { placedPieces, placedPoint } from './templates.ts';

export const DISCOVERY_EVENTS = [
  'clueRead',
  'landmarkArrival',
  'buildingArrival',
  'hatchEncounter',
  'hatchOpened',
  'entranceTravel',
  'sewerTravel',
] as const;
export type DiscoveryEvent = (typeof DISCOVERY_EVENTS)[number];
export type ScenarioDiscoveryState = Record<DiscoveryEvent, number | null>;
export const emptyDiscovery = (): ScenarioDiscoveryState =>
  Object.fromEntries(DISCOVERY_EVENTS.map((event) => [event, null])) as ScenarioDiscoveryState;

interface Box {
  min: Readonly<Vec3>;
  max: Readonly<Vec3>;
}
export interface ScenarioDiscovery {
  clues: readonly Readonly<Vec3>[];
  landmarks: readonly Box[];
  building: Box;
  entrance: Box;
  /** Each underground port's threshold, so the attempt records the sewer apart from the hatch. */
  ports: readonly Box[];
}

const portEnvelope = ([x, feet, z]: Readonly<Vec3>): Box => ({
  min: [x - STAIR_BODY_HALF_WIDTH, feet - 1, z - STAIR_BODY_HALF_WIDTH],
  max: [x + STAIR_BODY_HALF_WIDTH, feet + STAIR_BODY_HEIGHT, z + STAIR_BODY_HALF_WIDTH],
});

export const discoveryForPlan = (plan: CityPlan, registry: Registry): ScenarioDiscovery | undefined => {
  if (!(plan.service && plan.portal && plan.composition)) {
    return undefined;
  }
  const box = (origin: Readonly<Vec3>, size: Readonly<Vec3>) => ({
    min: origin,
    max: origin.map((value, axis) => value + size[axis]!) as Vec3,
  });
  const side = Math.max(plan.service.template.size[0], plan.service.template.size[2]);
  return {
    clues: plan.composition.leads.flatMap((placement) => {
      const pieces = placedPieces(placement);
      const fixed = plan.composition!.lootSources.find((source) => source.placement === placement)?.fixedLoot ?? [];
      return [
        ...pieces.filter((piece) => registry.furniture.get(piece.furniture)?.readable).map(({ pos }) => pos),
        ...fixed.flatMap((source) => {
          const index = placement.template.pieces.findIndex(
            (candidate) => candidate.pos.join(',') === source.at.join(','),
          );
          const piece = pieces[index];
          if (!piece) {
            throw new Error(`Missing lead item anchor ${source.at.join(',')}`);
          }
          return source.items
            .filter((item) => registry.items.get(item.item)?.readable)
            .map((item) => (item.placement === 'surface' ? furnitureSurfacePosition(piece) : piece.pos));
        }),
      ];
    }),
    landmarks: plan.composition.landmarks.map(({ origin, template }) => box(origin, template.size)),
    building: box([plan.service.origin[0], plan.floor, plan.service.origin[2]], [side, 4, side]),
    entrance: plan.portal.envelope,
    ports: plan.underground.flatMap(({ definition }) =>
      definition.ports.map((port) => portEnvelope(placedPoint(plan.service!, port.threshold))),
    ),
  };
};

export const nearDiscoveryBox = (
  position: Readonly<Vec3>,
  box: { min: Readonly<Vec3>; max: Readonly<Vec3> },
  margin: number,
): boolean => position.every((value, axis) => value >= box.min[axis]! - margin && value <= box.max[axis]! + margin);
