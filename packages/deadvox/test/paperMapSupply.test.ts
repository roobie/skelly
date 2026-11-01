import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { type LootSpawnPoint, lootPointStream, rollLoot } from '../src/core/loot.ts';
import { paperMapAt } from '../src/core/paperMap.ts';
import { Rng } from '../src/core/random.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { WORLD_REGION_METRES } from '../src/core/worldRegion.ts';
import { createSession, IDLE } from '../src/game/session.ts';
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

const coverage = (point: LootSpawnPoint, blockSize: number) =>
  rollLoot(registry, point, lootPointStream(17, point), blockSize).map(({ paperMap }) => paperMap);

describe('seeded regional map supply', () => {
  it('resolves each sheet from its source regardless of source visit order', () => {
    const left = source('left', [-1, 0, 0]);
    const right = source('right', [1, 0, 0]);
    const forward = [coverage(left, WORLD_REGION_METRES), coverage(right, WORLD_REGION_METRES)];
    const reverse = [coverage(right, WORLD_REGION_METRES), coverage(left, WORLD_REGION_METRES)];

    expect(forward).toEqual(reverse.reverse());
  });

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

  it('does not restock a taken sheet when its column returns', () => {
    const point = source('rolled-once', [3, 0, 0], [0, 1, 0]);
    const session = createSession({
      registry,
      seed: 19,
      scale: makeScale(2),
      world: new World(),
      isSolid: (_x, y) => y < 1,
      isOpaque: () => false,
      start: 0,
      spawn: [0, 1, 0],
      ready: () => false,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const site = {
      supplySourcesIn: () => [[0, 0] as const],
      furnitureIn: () => [],
      lootPointsIn: () => [point],
      zombiesIn: () => [],
    };

    session.onColumn(0, 0, site);
    const pile = [...session.inventory.piles.values()][0]!;
    const { item } = pile.items[0]!;
    const held = session.inventory.hands.right ?? session.inventory.hands.left;
    if (held) {
      expect(session.inventory.move(held, { kind: 'pile', pos: [0, 1, 0] }).ok).toBe(true);
    }
    expect(session.inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
    session.onColumnUnload(0, 0);
    session.onColumn(0, 0, site);

    expect(session.inventory.hands.right?.paperMap).toEqual(paperMapAt(6, 0));
    expect(session.inventory.piles.has(pile.pos.join(','))).toBe(false);
  });
});
