import { type LootSpawnPoint, rollLoot } from '@skelly/engine/internal/core/loot.ts';
import { paperMapAt } from '@skelly/engine/internal/core/paperMap.ts';
import { WORLD_REGION_METRES } from '@skelly/engine/internal/core/worldRegion.ts';
import { Inventory } from '@skelly/engine/inventory';
import { Rng } from '@skelly/engine/math';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const source = (
  id: string,
  position: [number, number, number],
  destination: [number, number, number] = position,
): LootSpawnPoint => ({
  id,
  channel: 'ground',
  position,
  destination,
  context: { usage: ['Residential'], tier: 'Tier1' },
  supply: { kind: 'fixed', items: [{ item: 'regional_map' }] },
  required: true,
});

describe('seeded regional map supply', () => {
  it('keeps the source region when the player is across its boundary at a non-default scale', () => {
    const blockSize = 2;
    const point = source(
      'boundary-source',
      [WORLD_REGION_METRES / blockSize - 1, 0, 0],
      [WORLD_REGION_METRES / blockSize, 0, 0],
    );
    const playerMetres = WORLD_REGION_METRES;
    const [rolled] = rollLoot(registry, point, Rng.stream(9, point.id), blockSize);
    const inventory = new Inventory(registry);
    const sheet = inventory.createRolled(rolled!);

    expect(sheet.paperMap).toEqual(paperMapAt(point.position[0] * blockSize, point.position[2] * blockSize));
    expect(sheet.paperMap).not.toEqual(paperMapAt(playerMetres, 0));
  });
});
