import { Box3, Group, type Mesh, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import {
  type FurnitureMover,
  liftFurniture,
  placeFurniture,
  placement,
  tipCarried,
  turnCarried,
} from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { LadderHold } from '../src/core/ladders.ts';
import { type Pose, rotatedSize, rotationOf, turnPose } from '../src/core/orientation.ts';
import { reachTuning } from '../src/core/reach.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { CarriedPiece } from '../src/render/carriedPiece.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
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

  it('shows the carried piece in view from lift until it is set down', () => {
    const inventory = new Inventory(registry);
    const furniture = mover(inventory);
    const piece = inventory.furnish(spec)!;
    const meshes = new FurnitureMeshes(formatWorldOptions.blockSize);
    const view = new CarriedPiece(
      inventory.entities,
      (entity, def) => meshes.pieceMesh(entity, def),
      reachTuning(registry).furnitureMove.carriedView,
    );
    const lookingNorth = new Quaternion();
    view.update(0, lookingNorth);
    expect(view.shown).toBe(false);

    expect(liftFurniture(furniture, piece)).toBeUndefined();
    view.update(0, lookingNorth);
    expect(view.shown).toBe(true);

    expect(placeFurniture(furniture, moved)).toBeUndefined();
    view.update(0, lookingNorth);
    expect(view.shown).toBe(false);
  });

  it('rebuilds only the moved piece, and nothing standing when the carried piece turns', () => {
    const inventory = new Inventory(registry);
    const { entities } = inventory;
    const still = inventory.furnish({ ...spec, pos: moved })!;
    const piece = inventory.furnish(spec)!;
    const meshes = new FurnitureMeshes(formatWorldOptions.blockSize);
    const meshOf = (entity: BlockEntity) => meshes.group.children[[...entities.all].indexOf(entity)];
    meshes.sync(entities);
    const stillMesh = meshOf(still);

    expect(liftFurniture(mover(inventory), piece)).toBeUndefined();
    meshes.sync(entities);
    expect(meshOf(still)).toBe(stillMesh);

    const { standing } = entities;
    expect(turnCarried(inventory)).toBeUndefined();
    expect(entities.standing).toBe(standing);
  });

  describe('turned or tipped', () => {
    const { maxSizeMetres } = reachTuning(registry).furnitureMove;
    const tall = [...registry.furniture.values()].find(
      (def) =>
        !(def.upright || def.mount || def.door || def.climbable || def.vehicle || def.scenarioGoal) &&
        def.shape !== undefined &&
        def.size[1] > def.size[0] &&
        def.size.every((cells) => cells * formatWorldOptions.blockSize <= maxSizeMetres),
    )!;
    const tallSpec = { type: tall.id, pos: origin, size: tall.size, facing: 'n' as const };

    it('tips about the world x axis and turns about the world vertical from any pose, so press order matters', () => {
      const size: Vec3 = [1, 2, 3];
      const box = (pose: Pose) => rotatedSize(size, rotationOf(pose));
      for (const facing of ['n', 'e', 's', 'w'] as const) {
        for (const tip of [undefined, 'back', 'front', 'left', 'right', 'top'] as const) {
          const [x, y, z] = box({ facing, tip });
          expect(box(turnPose({ facing, tip }, 'x'))).toEqual([x, z, y]);
          expect(box(turnPose({ facing, tip }, 'y'))).toEqual([z, y, x]);
        }
      }
      const upright: Pose = { facing: 'n' };
      expect(box(turnPose(turnPose(upright, 'x'), 'y'))).not.toEqual(box(turnPose(turnPose(upright, 'y'), 'x')));
    });

    it('fits under a ceiling lower than it stands only once laid down', () => {
      const inventory = new Inventory(registry);
      const [width, height] = tall.size;
      const shelf = origin[0] + Math.max(...tall.size) + 1;
      const furniture = {
        ...mover(inventory),
        terrainSolid: (x: number, y: number) => y < origin[1] || (x >= shelf && y >= origin[1] + width),
      };
      const piece = inventory.furnish(tallSpec)!;
      const aimed: Vec3 = [shelf + height, origin[1], origin[2]];
      inventory.entities.lift(piece);

      expect(placeFurniture(furniture, aimed)).toBe(messages.noRoom);
      expect(turnCarried(inventory)).toBeUndefined();
      expect(tipCarried(inventory)).toBeUndefined();
      expect(piece.size[1]).toBe(width);
      expect(placeFurniture(furniture, aimed)).toBeUndefined();
      expect(inventory.entities.at(...aimed)).toBe(piece);
    });

    it('draws, places and occupies the same box in hand and once set down, in every tip and facing', () => {
      const s = formatWorldOptions.blockSize;
      const meshes = new FurnitureMeshes(s);
      const drawnInBox = (piece: BlockEntity) => {
        const mesh = meshes.pieceMesh(piece, tall) as Mesh;
        const drawn = new Box3().setFromObject(mesh);
        const own = mesh.geometry.boundingBox!.getSize(new Vector3()).toArray();
        const low = new Vector3(...piece.pos).multiplyScalar(s);
        const high = new Vector3(...piece.size).multiplyScalar(s).add(low);
        expect(drawn.isEmpty()).toBe(false);
        expect(new Box3(low, high).expandByScalar(1e-6).containsBox(drawn)).toBe(true);
        const turned = rotatedSize(own, rotationOf(piece));
        for (const [axis, length] of drawn.getSize(new Vector3()).toArray().entries()) {
          expect(length).toBeCloseTo(turned[axis]! * s);
        }
      };

      const presses = ['', 'x', 'xx', 'xxx', 'yx', 'yyyx'];
      const poses = presses.map((sequence, i) => {
        const inventory = new Inventory(registry);
        const furniture = mover(inventory);
        const piece = inventory.furnish(tallSpec)!;
        expect(liftFurniture(furniture, piece)).toBeUndefined();
        for (const press of `${sequence}${'y'.repeat(i % 4)}`) {
          expect((press === 'x' ? tipCarried : turnCarried)(inventory)).toBeUndefined();
        }
        drawnInBox(piece);

        const outlined = placement(furniture, moved);
        expect(placeFurniture(furniture, moved)).toBeUndefined();
        expect(outlined).toEqual({ pos: piece.pos });
        const far = piece.pos.map((at, axis) => at + piece.size[axis]! - 1) as Vec3;
        expect(inventory.entities.at(...far)).toBe(piece);
        drawnInBox(piece);
        return { facing: piece.facing, tip: piece.tip };
      });
      expect(new Set(poses.map(({ tip }) => tip)).size).toBe(6);
      expect(new Set(poses.map(({ facing }) => facing)).size).toBe(4);
    });

    it('keeps its facing, tip and box in hand and once put down, through save and load', async () => {
      const runtime = createRuntime();
      const piece = runtime.inventory.furnish(tallSpec)!;
      runtime.entities.lift(piece);
      expect(turnCarried(runtime.inventory)).toBeUndefined();
      expect(tipCarried(runtime.inventory)).toBeUndefined();
      const turned = { facing: piece.facing, tip: piece.tip, size: [...piece.size] };
      expect(turned.tip).toBeDefined();
      expect(turned.size).not.toEqual(tall.size);

      const carried = await roundTrip(runtime);
      expect(carried.entities.carrying()).toMatchObject({ uid: piece.uid, ...turned });
      carried.entities.place(carried.entities.carrying()!, moved);

      const placed = await roundTrip(carried);
      expect(placed.entities.byUid(piece.uid)).toMatchObject({ pos: moved, carried: false, ...turned });
    });

    it('draws the piece in hand along its stored box whichever way the player looks', () => {
      const inventory = new Inventory(registry);
      const oblong = [...registry.furniture.values()].find(
        (def) =>
          !(def.mount || def.door || def.climbable || def.vehicle || def.scenarioGoal) &&
          def.shape !== undefined &&
          def.size[0] !== def.size[2] &&
          def.size.every((cells) => cells * formatWorldOptions.blockSize <= maxSizeMetres),
      )!;
      const piece = inventory.furnish({ type: oblong.id, pos: origin, size: oblong.size, facing: 'n' })!;
      const meshes = new FurnitureMeshes(formatWorldOptions.blockSize);
      const view = new CarriedPiece(
        inventory.entities,
        (entity, def) => meshes.pieceMesh(entity, def),
        reachTuning(registry).furnitureMove.carriedView,
      );
      const lookingEast = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
      const camera = new Group();
      camera.quaternion.copy(lookingEast);
      camera.add(view.group);
      inventory.entities.lift(piece);

      for (const turns of [0, 1]) {
        if (turns) {
          expect(turnCarried(inventory)).toBeUndefined();
        }
        view.update(0, lookingEast);
        camera.updateMatrixWorld(true);
        const drawn = new Box3().setFromObject(view.group).getSize(new Vector3());
        expect(drawn.x > drawn.z).toBe(piece.size[0] > piece.size[2]);
      }
    });

    it('turns but will not tip a piece marked upright', () => {
      const inventory = new Inventory(registry);
      const upright = [...registry.furniture.values()].find((def) => def.upright)!;
      const piece = inventory.furnish({ type: upright.id, pos: origin, size: upright.size, facing: 'n' })!;
      inventory.entities.lift(piece);

      expect(tipCarried(inventory)).toBe(messages.staysUpright);
      expect(piece.tip).toBeUndefined();
      expect(turnCarried(inventory)).toBeUndefined();
      expect(piece.facing).not.toBe('n');
    });
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
