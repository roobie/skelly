import {
  type BlockBox,
  createTerrainEvaluator,
  type Scale,
  type SiteTerrainPlan,
  type TerrainPlan,
} from '@skelly/engine/world';
import { baseTerrainShape } from '../baseRegistry.ts';

/** Small real terrain evaluator for consumer tests, without building a gameplay Site. */
export function withTerrainBoxes<T extends { readonly terrain: SiteTerrainPlan }>(
  site: T,
  boxes: readonly BlockBox[],
): T {
  const terrain: SiteTerrainPlan = {
    ...site.terrain,
    stamps: [...(site.terrain.stamps ?? []), { kind: 'boxes', boxes }],
  };
  return new Proxy(site, {
    get: (target, key, receiver) => (key === 'terrain' ? terrain : Reflect.get(target, key, receiver)),
  });
}

export const fixtureTerrain = ({
  scale,
  floor,
  ...overrides
}: { scale: Scale; floor?: number } & Partial<Omit<TerrainPlan, 'scale'>>) =>
  createTerrainEvaluator({
    seed: 17,
    blocks: { grass: 1, dirt: 2, rock: 3, sand: 4, water: 5 },
    shape: baseTerrainShape(),
    site:
      floor === undefined
        ? { kind: 'natural' }
        : {
            kind: 'forest-flat',
            data: {
              floor,
              bounds: {
                x0: Number.NEGATIVE_INFINITY,
                x1: Number.POSITIVE_INFINITY,
                z0: Number.NEGATIVE_INFINITY,
                z1: Number.POSITIVE_INFINITY,
              },
              trees: [],
              litter: 1,
            },
          },
    structures: [],
    scale,
    ...overrides,
  });
