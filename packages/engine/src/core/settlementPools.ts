import type { Registry } from './content.ts';
import type { MapPoolDef, PlotFit } from './schema.ts';
import { type Facing, footprint, type Turn, turnToward } from './templates.ts';

export const cityRowDepth = (grid: { blockZ: number; pad: number; rows: number; street: number }): number =>
  Math.floor((grid.blockZ - 2 * grid.pad - (grid.rows / 2 - 1) * grid.street) / grid.rows);

/**
 * The turn city admission compares a building at: its declared front facing the street, the way a city row turns it
 * (`packages/engine/src/core/cityPlan.ts`, `frontTurn`), so an east or west front swaps width and depth exactly as
 * placement does. Authored lots and layout sites turn buildings themselves and pass their own turn instead.
 */
export const frontFacingTurn = (front: Facing | undefined): Turn => turnToward(front ?? 'n', 'n');

/** The reserved row a building is admitted against, and the turn it stands at there. */
export interface AdmissionFit extends PlotFit {
  /** Absent admits the building with its declared front to the street. */
  readonly turn?: Turn;
}

/**
 * The fit an authored lot admits its building against: the reserved rect as authored and the lot's own turn, which is
 * the turn the lot stands the building at (`packages/engine/src/core/cityLots.ts`, `placedLot`), so an authored
 * rotation is honoured instead of the front-facing one.
 */
export const lotAdmissionFit = (lot: {
  readonly size: readonly [number, number];
  readonly turn: Turn;
}): AdmissionFit => ({ along: lot.size[0], depth: lot.size[1], turn: lot.turn });

export const eligibilityExclusion = (
  registry: Registry,
  ref: MapPoolDef['choices'][number]['ref'],
  settlementKind: string,
  fit: AdmissionFit,
): string | undefined => {
  if (ref.kind === 'piece') {
    return 'a piece is not a building';
  }
  const building = (ref.kind === 'template' ? registry.templates : registry.mapAssemblies).get(ref.id);
  if (!building) {
    return `no ${ref.kind} "${ref.id}"`;
  }
  if (!building.eligibility) {
    return 'missing building eligibility';
  }
  if (!building.eligibility.settlementKinds.includes(settlementKind)) {
    return `settlement kind "${settlementKind}" is excluded`;
  }
  const [along, depth] = footprint({ template: building, turn: fit.turn ?? frontFacingTurn(building.access?.front) });
  return along > fit.along || depth > fit.depth
    ? `plot ${along} by ${depth} does not fit reserved row ${fit.along} by ${fit.depth}`
    : undefined;
};

export const admittedChoices = (
  registry: Registry,
  poolId: string,
  kind: string,
  fit: AdmissionFit,
): MapPoolDef['choices'] => {
  const pool = registry.mapPools.get(poolId);
  if (!pool) {
    throw new Error(`Missing city pool "${poolId}"`);
  }
  return pool.choices.filter(({ ref }) => eligibilityExclusion(registry, ref, kind, fit) === undefined);
};
