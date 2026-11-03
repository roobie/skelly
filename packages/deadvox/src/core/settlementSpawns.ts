import { claimedId } from './capabilities.ts';
import type { Registry } from './content.ts';
import { Rng } from './random.ts';
import type { ActorSpawn, HordeSpawn, Rect } from './site.ts';
import type { SpawnMarker } from './templates.ts';

export const TEMPLATE_BLOCK_SIZE = 0.5;
export const HORDE_MEMBERS = [20, 50] as const;
const ZOMBIE_COUNT = [6, 10] as const;

export const settlementHordeSpawn = (
  registry: Pick<Registry, 'zombies'>,
  seed: number,
  road: Rect,
  { roadHeightAt, id }: { readonly roadHeightAt: (x: number) => number; readonly id: string },
): HordeSpawn => {
  const rng = Rng.stream(seed, 'settlement-horde');
  const x = Math.floor(road.x0 + (road.x1 - road.x0) * 0.68);
  return {
    id,
    type: claimedId(registry.zombies, 'settlementHorde'),
    pos: [x + 0.5, roadHeightAt(x) + 1, (road.z0 + road.z1) / 2],
    members: rng.int(...HORDE_MEMBERS),
  };
};

export const ordinarySpawnWeights = (registry: Pick<Registry, 'zombies'>): Map<string, number> =>
  new Map(
    [...registry.zombies]
      .filter(([, zombie]) => !zombie.authoredOnly)
      .map(([type, zombie]) => [type, zombie.spawnWeight]),
  );

export const settlementActorSpawns = (
  registry: Pick<Registry, 'zombies'>,
  seed: number,
  road: Rect,
  options: {
    readonly markers: readonly SpawnMarker[];
    readonly roadHeightAt: (x: number) => number;
    readonly spawnWeights?: ReadonlyMap<string, number>;
    readonly roadsideOffset?: number;
    readonly extraWanderers?: number;
  },
): ActorSpawn[] => {
  const { roadHeightAt, markers } = options;
  const rng = Rng.stream(seed, 'settlement-zombies');
  const wanderer = claimedId(registry.zombies, 'settlementWanderer');
  const spawnWeights = options.spawnWeights ?? new Map([[wanderer, 1]]);
  const selected = markers.filter((spawn) => rng.chance(spawn.chance * (spawnWeights.get(spawn.zombie) ?? 1)));
  const weightedTypes = [...spawnWeights].filter(([, weight]) => weight > 0);
  if (!weightedTypes.some(([type]) => type === wanderer)) {
    weightedTypes.push([wanderer, 1]);
  }
  const totalWeight = weightedTypes.reduce((total, [, weight]) => total + weight, 0);
  const wandererType = (): string => {
    let roll = rng.range(0, totalWeight);
    for (const [type, weight] of weightedTypes) {
      roll -= weight;
      if (roll < 0) {
        return type;
      }
    }
    return weightedTypes.at(-1)![0];
  };
  const count = rng.int(...ZOMBIE_COUNT);
  const spawns = selected.slice(0, count).map(({ zombie, pos, window: spawnWindow }) => ({
    type: zombie,
    pos,
    ...(spawnWindow ? { window: spawnWindow } : {}),
  }));
  const wanderers = count - spawns.length + (options.extraWanderers ?? 0);
  for (let i = 0; i < wanderers; i++) {
    const x = Math.floor(road.x0 + ((i + 1) * (road.x1 - road.x0)) / (wanderers + 1));
    const side = i % 2 === 0 ? -1 : 1;
    const z = Math.floor((road.z0 + road.z1) / 2 + side * (options.roadsideOffset ?? 8));
    spawns.push({ type: wandererType(), pos: [x, roadHeightAt(x) + 1, z] });
  }
  return spawns;
};
