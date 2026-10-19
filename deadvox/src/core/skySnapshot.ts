import type { BlockEntities } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, chunkKey, type Vec3 } from './coords.ts';
import { SKY_LOSS, type SkyBounds } from './skylight.ts';
import type { World } from './world.ts';

export const SKY_SHELL = 1;
export const SKY_HALO = Math.ceil(255 / SKY_LOSS) + SKY_SHELL;
export const growSky = (bounds: SkyBounds, amount: number): SkyBounds => ({
  min: bounds.min.map((value) => value - amount) as Vec3,
  max: bounds.max.map((value) => value + amount) as Vec3,
});
export const containsSky = ({ min, max }: SkyBounds, point: Vec3): boolean =>
  point.every((value, axis) => value >= min[axis]! && value < max[axis]!);
export const skyDependencyBounds = (bounds: SkyBounds, top: number): SkyBounds => ({
  ...growSky(bounds, SKY_HALO),
  max: [bounds.max[0] + SKY_HALO, top + 1, bounds.max[2] + SKY_HALO],
});
export const overlapsSky = (a: SkyBounds, b: SkyBounds): boolean =>
  a.min.every((value, axis) => value < b.max[axis]! && a.max[axis]! > b.min[axis]!);
export interface SkyChunk {
  cx: number;
  cy: number;
  cz: number;
  uniform: number | undefined;
  raw: Uint16Array | undefined;
}
export interface SkySnapshot {
  bounds: SkyBounds;
  bottom: number;
  top: number;
  chunks: SkyChunk[];
  furniture: SkyBounds[];
  opacity: Uint8Array;
  complete: boolean;
}
export interface CapturedSky {
  input: SkySnapshot;
  current: () => boolean;
}
export const skyFurniture = (entities: BlockEntities, bounds: SkyBounds): SkyBounds[] =>
  [...entities.all]
    .flatMap((entity) => entities.blockingBoxes(entity))
    .map(({ pos, size }) => ({
      min: [...pos] as Vec3,
      max: pos.map((value, axis) => value + size[axis]!) as Vec3,
    }))
    .filter((box) => overlapsSky(bounds, box));

/** Each continuation copies at most one chunk; transfers never own live chunk storage. */
export function* captureSky(
  { world, entities, registry }: { world: World; entities: BlockEntities; registry: Registry },
  bounds: SkyBounds,
  { bottom, top }: { bottom: number; top: number },
): Generator<void, CapturedSky> {
  const dependency = skyDependencyBounds(bounds, top);
  const chunks: SkyChunk[] = [];
  const versions: { coords: Vec3; chunk: Chunk | undefined; revision: number | undefined }[] = [];
  const furniture = skyFurniture(entities, dependency);
  const furnitureKey = JSON.stringify(furniture);
  const opacity = Uint8Array.from(registry.blocks, (definition, id) =>
    Number(id !== 0 && Boolean(definition?.opaque ?? definition?.solid)),
  );
  for (let cz = Math.floor(dependency.min[2] / CHUNK); cz <= Math.floor((dependency.max[2] - 1) / CHUNK); cz++) {
    for (let cx = Math.floor(dependency.min[0] / CHUNK); cx <= Math.floor((dependency.max[0] - 1) / CHUNK); cx++) {
      for (let cy = Math.floor(Math.max(bottom, dependency.min[1]) / CHUNK); cy <= Math.floor(top / CHUNK); cy++) {
        const chunk = world.getChunk(cx, cy, cz);
        versions.push({ coords: [cx, cy, cz], chunk, revision: chunk?.revision });
        chunks.push({ cx, cy, cz, uniform: chunk?.uniformId, raw: chunk?.raw()?.slice() });
        yield;
      }
    }
  }
  return {
    input: {
      bounds,
      bottom,
      top,
      chunks,
      furniture,
      opacity,
      complete: versions.every((entry) => entry.chunk !== undefined),
    },
    current: () =>
      versions.every(
        ({ coords, chunk, revision }) => world.getChunk(...coords) === chunk && chunk?.revision === revision,
      ) && JSON.stringify(skyFurniture(entities, dependency)) === furnitureKey,
  };
}
export const skyChunkMap = (snapshot: SkySnapshot): Map<string, SkyChunk> =>
  new Map(snapshot.chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy, chunk.cz), chunk]));
