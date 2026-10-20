import type { Registry } from './content.ts';
import type { MapPoolDef } from './schema.ts';

interface PlotFit {
  along: number;
  depth: number;
}

export const cityRowDepth = (grid: { blockZ: number; pad: number; rows: number; street: number }): number =>
  Math.floor((grid.blockZ - 2 * grid.pad - (grid.rows / 2 - 1) * grid.street) / grid.rows);

export const eligibilityExclusion = (
  registry: Registry,
  ref: MapPoolDef['choices'][number]['ref'],
  settlementKind: string,
  fit: PlotFit,
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
  return building.size[0] > fit.along || building.size[2] > fit.depth
    ? `plot ${building.size[0]} by ${building.size[2]} does not fit reserved row ${fit.along} by ${fit.depth}`
    : undefined;
};

export const admittedChoices = (
  registry: Registry,
  poolId: string,
  kind: string,
  fit: PlotFit,
): MapPoolDef['choices'] => {
  const pool = registry.mapPools.get(poolId);
  if (!pool) {
    throw new Error(`Missing city pool "${poolId}"`);
  }
  return pool.choices.filter(({ ref }) => eligibilityExclusion(registry, ref, kind, fit) === undefined);
};
