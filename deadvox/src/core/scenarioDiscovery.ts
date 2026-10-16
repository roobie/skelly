import type { CityPlan } from './cityPlan.ts';
import type { Registry } from './content.ts';
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
            .map((item) =>
              item.placement === 'surface'
                ? ([piece.pos[0], piece.pos[1] + piece.size[1], piece.pos[2]] as Vec3)
                : piece.pos,
            );
        }),
      ];
    }),
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
