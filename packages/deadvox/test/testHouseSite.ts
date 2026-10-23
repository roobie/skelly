import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { Registry } from '../src/core/content.ts';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { FurnitureSpawn, Rect, Site } from '../src/core/site.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';

/**
 * The authored test house at the template scale, with its blocks generated on demand. A caller may pass the site
 * that wraps it, such as the debug one, and the area in metres whose furniture to gather.
 */
export const testHouseSite = <S extends Site = AuthoredSite>(
  registry: Registry,
  wrap?: (house: AuthoredSite) => S,
  area?: (site: S) => Rect,
) => {
  const layout = registry.layouts.get('testHouse')!;
  const scale = makeScale(0.5);
  const s = scale.blockSize;
  const house = new AuthoredSite(7, registry, scale, layout);
  const site = (wrap ? wrap(house) : house) as S;
  const { seed } = house;
  const { x0, x1, z0, z1 } = area ? area(site) : layout.bounds;
  const world = new World();
  const columns = new Set<string>();
  const at = (x: number, y: number, z: number): number => {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const key = `${cx},${cz}`;
    if (!columns.has(key)) {
      for (const chunk of generateColumn(
        {
          seed,
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
  const furniture: FurnitureSpawn[] = [];
  const span = CHUNK * s;
  for (let cx = Math.floor(x0 / span); cx <= Math.floor(x1 / span); cx++) {
    for (let cz = Math.floor(z0 / span); cz <= Math.floor(z1 / span); cz++) {
      furniture.push(...site.furnitureIn(cx, cz));
    }
  }
  const insideLot = ([x, , z]: Vec3) =>
    x * s >= layout.bounds.x0 && x * s < layout.bounds.x1 && z * s >= layout.bounds.z0 && z * s < layout.bounds.z1;
  const walkable = (x: number, y: number, z: number) =>
    solid(x, y - 1, z) && [0, 1, 2, 3].every((dy) => !solid(x, y + dy, z));
  return { layout, scale, s, house, site, at, solid, furniture, insideLot, walkable };
};
