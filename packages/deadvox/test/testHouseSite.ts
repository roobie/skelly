import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { Registry } from '../src/core/content.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';

/** The authored test house at the template scale, with its blocks generated on demand. */
export const testHouseSite = (registry: Registry) => {
  const layout = registry.layouts.get('testHouse')!;
  const scale = makeScale(0.5);
  const s = scale.blockSize;
  const site = new AuthoredSite(7, registry, scale, layout);
  const world = new World();
  const columns = new Set<string>();
  const at = (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const key = `${cx},${cz}`;
    if (!columns.has(key)) {
      for (const chunk of generateColumn(
        {
          seed: site.seed,
          scale,
          shape: terrainShapeOf(registry),
          blocks: sitePalette(registry).terrain,
          surface: site.surface,
          stamp: (target) => site.stamp(target),
        },
        cx,
        cz,
      )) {
        world.addChunk(chunk);
      }
      columns.add(key);
    }
    return world.getBlock(x, y, z);
  };
  const solid = (x: number, y: number, z: number) => registry.blocks[at(x, y, z)]!.solid;
  const furniture: ReturnType<AuthoredSite['furnitureIn']> = [];
  const span = CHUNK * s;
  for (let cx = Math.floor(layout.bounds.x0 / span); cx <= Math.floor(layout.bounds.x1 / span); cx++) {
    for (let cz = Math.floor(layout.bounds.z0 / span); cz <= Math.floor(layout.bounds.z1 / span); cz++) {
      furniture.push(...site.furnitureIn(cx, cz));
    }
  }
  const insideLot = ([x, , z]: Vec3) =>
    x * s >= layout.bounds.x0 && x * s < layout.bounds.x1 && z * s >= layout.bounds.z0 && z * s < layout.bounds.z1;
  const walkable = (x: number, y: number, z: number) =>
    solid(x, y - 1, z) && [0, 1, 2, 3].every((dy) => !solid(x, y + dy, z));
  return { layout, scale, s, site, at, solid, furniture, insideLot, walkable };
};
