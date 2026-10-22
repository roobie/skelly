import { expect, it } from 'vitest';
import { BlockEntities, type BlockEntityState } from '../src/core/blockEntities.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { capture, createRuntime, encodeFixture, formatVersion, registry } from './snapshotTestSupport.ts';

const CRATE = 'crate';
const DOOR = 'wood_door';
const { durability } = registry.furniture.get(CRATE)!.breach;

const throughSaveFile = async (entities: BlockEntities): Promise<BlockEntities> => {
  const captured = capture(createRuntime());
  const snapshot = {
    ...captured,
    character: {
      ...captured.character,
      inventory: { ...captured.character.inventory, entities: entities.snapshotState() },
    },
  };
  const decoded = await decodeSave(await encodeFixture(snapshot), {
    contentLookup: () => true,
    version: formatVersion,
  });
  return BlockEntities.restoreState(registry, decoded.snapshot.character.inventory.entities);
};

/**
 * A standing crate restored with `saved` merged into its state. Blows reach only door leaves until strikes reach
 * every piece, so the damage comes in the way a save carries it.
 */
const restoredCrate = (saved: Partial<BlockEntityState>, type = CRATE, size: Vec3 = [2, 2, 2]) => {
  const entities = new BlockEntities(registry);
  const crate = entities.add({ type, pos: [4, 1, 4], size, facing: 'n' })!;
  const state = entities.snapshotState();
  const restored = BlockEntities.restoreState(registry, {
    ...state,
    entities: state.entities.map((entity) => (entity.uid === crate.uid ? { ...entity, ...saved } : entity)),
  });
  return { entities: restored, crate: restored.byUid(crate.uid)! };
};

it("keeps a piece's damage through a save while it stands, and while it is lifted, tipped, saved carried and stood down", async () => {
  const damage = durability / 2;
  const standing = restoredCrate({ damage });
  const reloaded = await throughSaveFile(standing.entities);
  expect(reloaded.byUid(standing.crate.uid)!.damage).toBe(damage);
  expect(reloaded.conditionOf(reloaded.byUid(standing.crate.uid)!)).toBeCloseTo(0.5);

  // A ruining blow that found no room leaves the piece standing at full damage, which a save must carry.
  const stalled = restoredCrate({ damage: durability });
  const stalledReloaded = await throughSaveFile(stalled.entities);
  expect(stalledReloaded.byUid(stalled.crate.uid)!.damage).toBe(durability);

  const crate = reloaded.byUid(standing.crate.uid)!;
  reloaded.lift(crate);
  reloaded.orient(crate, { facing: 'e', tip: 'left' });
  const carried = await throughSaveFile(reloaded);
  const held = carried.carrying()!;
  expect(held).toMatchObject({ uid: crate.uid, damage });
  carried.place(held, [8, 1, 8]);
  expect(carried.byUid(crate.uid)).toMatchObject({ carried: false, damage });
});

it('refuses a saved piece whose damage is not a finite positive amount within its durability, or a broken piece that is no leaf', () => {
  for (const damage of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
    expect(() => restoredCrate({ damage }), `damage ${damage}`).toThrow('Invalid furniture damage');
  }
  expect(() => restoredCrate({ damage: durability * 2 })).toThrow('must stay within its durability');
  // A door leaf at its durability is broken, not stalled, so a standing one there is refused.
  const leaf = registry.furniture.get(DOOR)!;
  expect(() => restoredCrate({ damage: leaf.breach.durability }, DOOR, [...leaf.size] as Vec3)).toThrow(
    'must stay within its durability',
  );
  expect(() => restoredCrate({ broken: true, open: true })).toThrow('Only a door leaf can be broken');
});
