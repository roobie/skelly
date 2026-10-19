import { describe, expect, it } from 'vitest';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, liftFurniture, placeFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { LadderHold } from '../src/core/ladders.ts';
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

  it('lets a stack on a lifted piece settle bottom up, whatever order it was furnished in', () => {
    const inventory = new Inventory(registry);
    const [, height] = crate.size;
    const at = (level: number): Vec3 => [origin[0], origin[1] + level * height, origin[2]];
    const top = inventory.furnish({ ...spec, pos: at(2) })!;
    const middle = inventory.furnish({ ...spec, pos: at(1) })!;
    const lifted = inventory.furnish(spec)!;
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

  describe('in an open doorway', () => {
    const doorDef = [...registry.furniture.values()].find((def) => def.door && !def.door.hatch && !def.shape)!;
    const doorway = { type: doorDef.id, pos: moved, size: doorDef.size, facing: 'n' as const };

    it('stands a piece there, which keeps the door from closing until it is lifted out', () => {
      const inventory = new Inventory(registry);
      const furniture = mover(inventory);
      const piece = inventory.furnish(spec)!;
      const door = inventory.entities.add(doorway)!;
      expect(inventory.entities.setOpen(door, true)).toBeUndefined();
      const aimed: Vec3 = [
        moved[0] + Math.floor(crate.size[0] / 2),
        moved[1],
        moved[2] + Math.floor(crate.size[2] / 2),
      ];

      expect(liftFurniture(furniture, piece)).toBeUndefined();
      expect(placeFurniture(furniture, aimed)).toBeUndefined();
      expect(inventory.entities.at(...moved)).toBe(piece);
      expect(inventory.entities.isSolid(...moved)).toBe(true);
      expect(inventory.entities.doorAt(...moved)).toBe(door);
      expect(inventory.entities.closeDoor(door, furniture.player, [])).toBe('other');
      expect(door.open).toBe(true);

      expect(liftFurniture(furniture, piece)).toBeUndefined();
      expect(inventory.entities.isSolid(...moved)).toBe(false);
      expect(inventory.entities.closeDoor(door, furniture.player, [])).toBeUndefined();
      expect(inventory.entities.isSolid(...moved)).toBe(true);
    });

    it('keeps the piece in the doorway and the door behind it through save and load', async () => {
      const runtime = createRuntime();
      const piece = runtime.inventory.furnish(spec)!;
      const door = runtime.entities.add(doorway)!;
      expect(runtime.entities.setOpen(door, true)).toBeUndefined();
      runtime.entities.lift(piece);
      runtime.entities.place(piece, moved);

      const loaded = await roundTrip(runtime);
      const restored = loaded.entities.byUid(piece.uid)!;
      const restoredDoor = loaded.entities.byUid(door.uid)!;
      expect(restoredDoor.open).toBe(true);
      expect(loaded.entities.at(...moved)).toBe(restored);
      expect(loaded.entities.doorAt(...moved)).toBe(restoredDoor);
      loaded.entities.lift(restored);
      expect(loaded.entities.at(...moved)).toBe(restoredDoor);
    });
  });

  describe('with a ladder', () => {
    const ladderDef = [...registry.furniture.values()].find((def) => def.climbable)!;
    const setup = () => {
      const inventory = new Inventory(registry);
      const furniture = mover(inventory);
      const piece = inventory.furnish(spec)!;
      const ladderAt = (pos: Vec3) =>
        inventory.entities.add({ type: ladderDef.id, pos, size: ladderDef.size, facing: 'n' })!;
      const hold = new LadderHold({
        entities: inventory.entities,
        body: furniture.player,
        inventory,
        reachBelow: 0.5,
        reach: 50,
      });
      inventory.handHold = hold;
      return { inventory, furniture, piece, ladderAt, hold };
    };

    it('refuses a lift while a hand is on the ladder', () => {
      const { furniture, piece, ladderAt, hold } = setup();
      expect(hold.grab(ladderAt([30, origin[1], 30]))).toBeUndefined();
      expect(hold.on).toBe(true);

      const holding = hold.refusal(hold.hand()!);
      expect(holding).toBeDefined();
      expect(liftFurniture(furniture, piece)).toBe(holding);
    });

    it('lets go of a ladder grabbed but not reached when a piece is lifted', () => {
      const { inventory, furniture, piece, ladderAt, hold } = setup();
      expect(hold.grab(ladderAt([10, origin[1], 10]))).toBeUndefined();
      expect(hold.snapshotState()).toMatchObject({ on: false });

      expect(liftFurniture(furniture, piece)).toBeUndefined();
      expect(hold.piece(false)).toBeUndefined();
      expect(hold.snapshotState()).toBeNull();
      expect(inventory.entities.carrying()).toBe(piece);
    });

    it('refuses to grab a ladder while carrying a piece', () => {
      const { furniture, piece, ladderAt, hold } = setup();
      expect(liftFurniture(furniture, piece)).toBeUndefined();

      expect(hold.grab(ladderAt([30, origin[1], 30]))).toBe(messages.handsFull);
      expect(hold.piece(false)).toBeUndefined();
      expect(hold.on).toBe(false);
    });
  });
});
