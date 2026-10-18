import { describe, expect, it } from 'vitest';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, liftFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  formatWorldOptions,
  registry,
} from './snapshotTestSupport.ts';

const crate = registry.furniture.get('crate')!;
const origin: Vec3 = [3, 1, 3];
const spec = { type: crate.id, pos: origin, size: crate.size, facing: 'n' as const };
const moved: Vec3 = [3 + crate.size[0], 1, 3];

const messages = registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages;

/** A player well clear of the fixture, on a flat floor, with stamina to spare. */
const mover = (inventory: Inventory): FurnitureMover => ({
  inventory,
  terrainSolid: (_x, y) => y < origin[1],
  blockSize: formatWorldOptions.blockSize,
  player: { pos: [30, origin[1], 30], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
  others: [],
  stamina: 100,
});

const roundTrip = async (runtime: ReturnType<typeof createRuntime>) => {
  const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
  return createRuntime(decoded.snapshot);
};

describe('movable furniture', () => {
  it('does not respawn a moved piece when its column generates again', () => {
    const inventory = new Inventory(registry);
    const piece = inventory.furnish(spec)!;
    inventory.entities.lift(piece);
    inventory.entities.place(piece, moved);

    expect(inventory.furnish(spec)).toBeUndefined();
    expect([...inventory.entities.all]).toEqual([piece]);
    expect(inventory.entities.at(...origin)).toBeUndefined();
    expect(inventory.entities.at(...moved)).toBe(piece);
  });

  it('keeps a moved piece where it was put, and its origin claimed, through save and load', async () => {
    const runtime = createRuntime();
    const piece = runtime.inventory.furnish(spec)!;
    runtime.entities.lift(piece);
    runtime.entities.place(piece, moved);

    const loaded = await roundTrip(runtime);
    const restored = loaded.entities.byUid(piece.uid)!;
    expect(restored).toMatchObject({ origin, pos: moved, carried: false });
    expect(loaded.entities.at(...moved)).toBe(restored);
    expect(loaded.inventory.furnish(spec)).toBeUndefined();
  });

  it('keeps a carried piece and what it holds in hand through save and load', async () => {
    const runtime = createRuntime();
    const piece = runtime.inventory.furnish(spec, [{ type: 'canned_beans', count: 1, condition: 1 }])!;
    const [beans] = piece.pockets!.flat();
    runtime.entities.lift(piece);

    const loaded = await roundTrip(runtime);
    const restored = loaded.entities.carrying()!;
    expect(restored).toMatchObject({ uid: piece.uid, origin, carried: true });
    expect([...loaded.entities.all]).not.toContain(restored);
    expect(loaded.entities.at(...origin)).toBeUndefined();
    expect(loaded.inventory.itemByUid(beans!.item.uid)).toBeDefined();
  });

  it('lets a stack on a lifted piece settle in order, with what lay on top following it down', () => {
    const inventory = new Inventory(registry);
    const [, height] = crate.size;
    const at = (level: number): Vec3 => [origin[0], origin[1] + level * height, origin[2]];
    const lifted = inventory.furnish(spec)!;
    const middle = inventory.furnish({ ...spec, pos: at(1) })!;
    const top = inventory.furnish({ ...spec, pos: at(2) })!;
    expect(inventory.add(inventory.create('canned_beans'), { kind: 'pile', pos: at(3) })).toBe(true);
    const [beans] = inventory.pileAt(at(3))!.items;

    expect(liftFurniture(mover(inventory), lifted)).toBeUndefined();

    expect(inventory.entities.carrying()).toBe(lifted);
    expect(middle.pos).toEqual(at(0));
    expect(top.pos).toEqual(at(1));
    expect(inventory.pileAt(at(2))?.items).toEqual([beans]);
  });

  it('takes both empty hands to carry a piece', () => {
    const inventory = new Inventory(registry);
    const piece = inventory.furnish(spec)!;
    const tool = inventory.create('canned_beans');
    expect(inventory.add(tool, { kind: 'hand', side: 'left' })).toBe(true);

    expect(liftFurniture(mover(inventory), piece)).toBe(messages.handsFull);

    expect(inventory.move(tool, { kind: 'pile', pos: moved }).ok).toBe(true);
    expect(liftFurniture(mover(inventory), piece)).toBeUndefined();
    expect(inventory.plan(tool, { kind: 'hand', side: 'right' })).toEqual({ ok: false, reason: messages.handsFull });
  });
});
