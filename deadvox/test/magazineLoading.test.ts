import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { itemActionsFor } from '../src/game/itemActions.ts';
import { MagazineHandling, ROUND_LOAD_SIM_SECONDS, ROUND_STRIP_SIM_SECONDS } from '../src/game/magazineHandling.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { RELOAD_GESTURE_MS, ReloadInput } from '../src/game/reloadInput.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const base = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const magazineType = 'magazine_akm_30';
const roundType = 'cartridge_7_d_62x39';
const otherCalibre = 'cartridge_5_d_56x45';
/** A second cartridge type of the magazine's calibre, so feed order is observable. */
const markedRound = 'test_marked_7_d_62x39';
/** Owns a small capacity rather than pinning the exported column's round count. */
const CAPACITY = 3;

const testContent = (): Registry => {
  const modelId = registry.items.get(magazineType)!.model!;
  return {
    ...registry,
    models: new Map(registry.models).set(modelId, { ...registry.models.get(modelId)!, capacity: CAPACITY }),
    items: new Map(registry.items).set(markedRound, { ...registry.items.get(roundType)!, id: markedRound }),
  };
};

/** Carried stacks in creation order: loading takes the lowest uid first. */
const fixture = (carried: readonly (readonly [string, number])[]) => {
  const inventory = new Inventory(testContent());
  const magazine = inventory.create(magazineType);
  const bag = inventory.create('hiking_backpack');
  const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
  if (
    !(
      inventory.add(magazine, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      carried.every(([type, count]) => inventory.add(inventory.create(type, count), pocket))
    )
  ) {
    throw new Error('Magazine fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const handling = new MagazineHandling(inventory, queue, { feet: () => [0, 0, 0], reloadFactor: () => 1 });
  const load = () => {
    const refusal = handling.loadNext(magazine.uid, 0);
    if (refusal) {
      throw new Error(refusal);
    }
    queue.tick(ROUND_LOAD_SIM_SECONDS);
  };
  const strip = () => {
    const refusal = handling.strip(magazine.uid, 0);
    if (refusal) {
      throw new Error(refusal);
    }
    queue.tick(ROUND_STRIP_SIM_SECONDS);
  };
  const loose = (type: string) =>
    [...inventory.items()].filter(({ item }) => item.type === type).reduce((sum, { item }) => sum + item.count, 0);
  const rounds = () => loose(roundType) + loose(markedRound) + magazine.cartridges!.length;
  return { inventory, magazine, queue, handling, load, strip, loose, rounds };
};

const MARKED_THEN_PLAIN = [
  [markedRound, 1],
  [roundType, 10],
] as const;

describe('magazines loaded round by round', () => {
  it('conserves rounds and carried weight through loading and stripping, stripping the last round loaded', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const rounds = f.rounds();
    const weight = f.inventory.carriedWeight();
    for (let i = 0; i < CAPACITY; i++) {
      f.load();
      expect(f.rounds()).toBe(rounds);
      expect(f.inventory.carriedWeight()).toBe(weight);
    }
    // The first round loaded sits at the bottom; the top round is the next fed or stripped.
    expect(f.magazine.cartridges!.at(-1)).toBe(markedRound);
    expect(f.magazine.cartridges![0]).toBe(roundType);
    f.strip();
    expect(f.magazine.cartridges).toHaveLength(CAPACITY - 1);
    expect(f.magazine.cartridges!.at(-1)).toBe(markedRound);
    expect(f.rounds()).toBe(rounds);
    expect(f.inventory.carriedWeight()).toBe(weight);
  });

  it('refuses a full magazine and other calibres without consuming a round', () => {
    const full = fixture(MARKED_THEN_PLAIN);
    for (let i = 0; i < CAPACITY; i++) {
      full.load();
    }
    const loose = full.loose(roundType);
    expect(full.handling.loadNext(full.magazine.uid, 0)).toBeDefined();
    expect(full.queue.jobs).toEqual([]);
    expect(full.loose(roundType)).toBe(loose);
    const wrong = fixture([[otherCalibre, 5]]);
    expect(wrong.handling.loadNext(wrong.magazine.uid, 0)).toBeDefined();
    expect(wrong.queue.jobs).toEqual([]);
    expect(wrong.loose(otherCalibre)).toBe(5);
    expect(wrong.magazine.cartridges).toEqual([]);
  });

  it('offers stripping as the held magazine’s item action, only while it holds a round', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const body = new Body(BODY_TUNING_FIXTURE);
    expect(selectPrimaryAction(f.inventory, 'right')).toMatchObject({ kind: 'magazine', item: f.magazine });
    expect(itemActionsFor(f.magazine, f.inventory, body)).toEqual([]);
    f.load();
    expect(itemActionsFor(f.magazine, f.inventory, body).map(({ magazine }) => magazine)).toEqual(['strip']);
  });

  it('R release cancels a partial load without losing a round', () => {
    const f = fixture(MARKED_THEN_PLAIN);
    const input = new ReloadInput();
    const binding = {
      uid: f.magazine.uid,
      busy: () => f.queue.busy,
      load: () => f.handling.loadNext(f.magazine.uid, 0.25) === undefined,
      rack: () => false,
      remove: () => undefined,
      cancelLoad: () => f.handling.cancelLoad(f.magazine.uid),
    };
    const rounds = f.rounds();
    input.keyDown(0, binding);
    input.advance(RELOAD_GESTURE_MS.hold, binding);
    f.queue.tick(ROUND_LOAD_SIM_SECONDS / 2);
    expect(f.queue.jobs).toHaveLength(1);
    input.keyUp(750);
    input.advance(1000, binding);
    expect(f.magazine.cartridges).toEqual([]);
    expect(f.rounds()).toBe(rounds);
    expect(f.queue.jobs).toEqual([]);
  });

  it('keeps the loaded rounds and their order through a save, and rejects over-capacity or wrong-calibre contents', async () => {
    const f = fixture(MARKED_THEN_PLAIN);
    f.load();
    f.load();
    const loaded = [...f.magazine.cartridges!];
    const session = createSession({
      registry,
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 71,
      start: 0,
      spawn: [0, 0, 0],
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
    const snapshot = session.snapshot({ worldId: 'magazine-world', characterId: 'magazine-character' });
    const saved = { ...snapshot, character: { ...snapshot.character, inventory: f.inventory.snapshotState() } };
    const version: SaveVersionComponents = {
      schemaVersion: SAVE_SCHEMA_VERSION,
      simulationHash: 'a'.repeat(64),
      generators: {},
      contentPacks: [],
    };
    const bytes = await encodeSave(saved, {
      generation: 1,
      version,
      worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
    });
    const decoded = await decodeSave(bytes, { version, contentLookup: () => true });
    const restored = Inventory.restoreState(f.inventory.registry, decoded.snapshot.character.inventory);
    expect(restored.hands.right?.cartridges).toEqual(loaded);
    for (const cartridges of [Array.from({ length: CAPACITY + 1 }, () => roundType), [otherCalibre]]) {
      const corrupt = structuredClone(decoded.snapshot.character.inventory);
      corrupt.hands.right!.cartridges = cartridges;
      expect(() => Inventory.restoreState(f.inventory.registry, corrupt)).toThrow();
    }
  });
});
