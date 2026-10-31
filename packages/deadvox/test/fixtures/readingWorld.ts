import type { EntitySpec } from '../../src/core/blockEntities.ts';
import { blockId, type Registry } from '../../src/core/content.ts';
import { toChunk, type Vec3 } from '../../src/core/coords.ts';
import { type LootPointSource, lootPointsByColumn } from '../../src/core/loot.ts';
import type { Scale } from '../../src/core/scale.ts';
import { fillFurnitureLoot, type Site, SupplyFootprints } from '../../src/core/site.ts';
import fixture from './mods/reading-world.json' with { type: 'json' };

export const readingWorld = (registry: Registry, seed: number, scale: Scale): Site => {
  const furniture: EntitySpec[] = fixture.containers.map(({ type, pos, facing }) => ({
    type,
    pos: pos as Vec3,
    facing: facing as EntitySpec['facing'],
    size: registry.furniture.get(type)!.size,
  }));
  const points = lootPointsByColumn(
    furniture.map(
      (spec): LootPointSource => ({
        site: 'reading-world',
        building: spec.pos.join(','),
        anchor: spec.pos,
        channel: 'container',
        position: spec.pos,
        destination: spec.pos,
        context: { usage: ['Residential'], tier: 'Tier1' },
        supply: fixture.supply as LootPointSource['supply'],
        required: true,
        fixture: true,
      }),
    ),
  );
  return {
    spawn: { pos: fixture.spawn.pos as Vec3, yaw: fixture.spawn.yaw },
    surface: {
      height: () => fixture.floor / scale.blockSize - 1,
      top: () => blockId(registry, fixture.ground),
    },
    stamp: () => {
      // The authored terrain is the entire walking surface; no structure stamps are needed.
    },
    supplySourcesIn: (area) => new SupplyFootprints(furniture, [...points.values()].flat()).in(area),
    lootPointsIn: (cx, cz) => points.get(`${cx},${cz}`) ?? [],
    furnitureIn: (cx, cz) =>
      fillFurnitureLoot(
        registry,
        seed,
        furniture
          .filter(({ pos }) => toChunk(pos[0]) === cx && toChunk(pos[2]) === cz)
          .map((spec) => ({ spec, loot: [] })),
        points.get(`${cx},${cz}`) ?? [],
      ),
    zombiesIn: () => [],
  };
};
