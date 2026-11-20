import { apertureShapes } from '@skelly/engine/internal/core/apertureCollision.js';
import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import { worldLightBlocking, worldOpaque, worldSolid } from '@skelly/engine/internal/core/collision.ts';
import { resolveDestructibleHit } from '@skelly/engine/internal/core/destructibleHit.ts';
import { pickFurnitureHit } from '@skelly/engine/internal/core/furniturePick.ts';
import { litEnoughToRead, reaches } from '@skelly/engine/internal/core/illumination.ts';
import { LampReachCache } from '@skelly/engine/internal/core/lampReach.ts';
import { rotatedSize, rotationOf } from '@skelly/engine/internal/core/orientation.ts';
import { stepBodyHorizontal } from '@skelly/engine/internal/core/physics.js';
import { furnitureBounds } from '@skelly/engine/internal/core/skySnapshot.ts';
import { blowLandsOnPane, strikeWindowPane } from '@skelly/engine/internal/core/windowImpact.ts';
import { windowParts } from '@skelly/engine/internal/core/windowParts.ts';
import { registerWindowAction, WINDOW_ACTION } from '@skelly/engine/internal/game/windowAction.ts';
import { HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import { coreMessage } from '@skelly/engine/text';
import { BlockEntities, type BlockEntity, CONTACT_SKIN, type Facing, type Vec3, World } from '@skelly/engine/world';
import { FurnitureMeshes } from '@skelly/presentation/internal/render/furniture.ts';
import { castsAndReceives } from '@skelly/presentation/internal/render/shadowFlags.ts';
import { contentLookup } from '@skelly/presentation/ui';
import { Mesh } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { baseContentSources } from './baseContentFiles.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const pane = {
  inside: 'back',
  hinge: 'low',
  thicknessBlocks: 0.1,
  frameWidthBlocks: 0.1,
  passageLeewayMetres: 0.02,
  sashWidthBlocks: 0.1,
  openTurnRadians: -Math.PI / 2,
  handlingSimSeconds: 0.1,
  initialPane: 'intact',
  initialLatched: true,
  minimumForce: 2,
  breakForce: 12,
  forceTaken: 7,
  shards: { item: 'window_test_shards', count: 3 },
  impactSound: 'door_bash',
  shatterSound: 'door_bash',
  glass: { color: '#ddeeff', opacity: 0.2, thicknessBlocks: 0.01 },
  hardwareColor: '#aaaabb',
  hardwareSizeBlocks: 0.1,
  remnantHeightBlocks: 0.1,
};
const { registry, issues } = buildFixtureRegistry([
  ...baseContentSources(),
  {
    source: 'window-test.json',
    data: {
      items: [
        {
          id: 'window_test_shards',
          name: 'Test shards',
          category: 'material',
          size: [1, 1],
          weight: 1,
          stack: 4,
          groundHazard: 'sharp',
        },
      ],
      furniture: ['low', 'high'].flatMap((hinge) =>
        ['front', 'back'].map((inside) => ({
          id: `window_test_${hinge}_${inside}`,
          name: 'Test window',
          size: [4, 5, 1],
          color: '#997755',
          window: { ...pane, hinge, inside },
        })),
      ),
      boardings: [
        {
          id: 'window_test_boards',
          name: 'Test boards',
          color: '#806040',
          thicknessBlocks: 0.1,
          boards: [
            { from: 0.1, height: 0.35 },
            { from: 0.55, height: 0.35 },
          ],
        },
      ],
    },
  },
]);
const BOARDING = { type: 'window_test_boards', side: 'front' } as const;
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const make = (facing: Facing = 'n', hinge = 'low', inside = 'back', inventory = new Inventory(registry)) => {
  const type = `window_test_${hinge}_${inside}`;
  const size = rotatedSize(registry.furniture.get(type)!.size, rotationOf({ facing }));
  const entity = inventory.entities.add({ type, pos: [0, 0, 0], size, facing, fixed: true })!;
  return { inventory, entities: inventory.entities, entity };
};
/** A north-facing window authored with `BOARDING` on its front, the street face. */
const boarded = (inventory = new Inventory(registry)) => {
  const type = 'window_test_low_back';
  const size = [...registry.furniture.get(type)!.size] as Vec3;
  const entity = inventory.entities.add({ type, pos: [0, 0, 0], size, facing: 'n', fixed: true, boarding: BOARDING })!;
  return { inventory, entities: inventory.entities, entity };
};
const beside = (entity: BlockEntity, face: 'front' | 'back'): Vec3 => {
  const [, , normal] = rotationOf(entity);
  return entity.pos.map(
    (value, axis) => value + entity.size[axis]! / 2 + normal[axis]! * (face === 'front' ? -2 : 2),
  ) as Vec3;
};
const breakPane = (entities: BlockEntities, entity: BlockEntity) =>
  entities.hitWindowPane(entity, { force: registry.furniture.get(entity.type)!.window!.breakForce, continuation: 0 });

describe('fitted windows', () => {
  it.each([
    ['n', 'low', 'back'],
    ['e', 'high', 'front'],
    ['s', 'high', 'back'],
    ['w', 'low', 'front'],
  ] as const)('round-trips the authored inside face and hinge with a %s-facing sash', (facing, hinge, inside) => {
    const { entities, entity } = make(facing, hinge, inside);
    const from = beside(entity, inside);
    const other = beside(entity, inside === 'front' ? 'back' : 'front');
    expect(entities.operateWindow(entity, 'unlatch', other, [])).toBeDefined();
    expect(entities.operateWindow(entity, 'unlatch', from, [])).toBeUndefined();
    expect(entities.operateWindow(entity, 'open', other, [])).toBeUndefined();
    const geometry = windowParts(entity, entities.defOf(entity), 0.5, undefined);
    const restored = BlockEntities.restoreState(registry, structuredClone(entities.snapshotState()));
    const sash = restored.byUid(entity.uid)!;
    expect(sash.facing).toBe(facing);
    expect(windowParts(sash, restored.defOf(sash), 0.5, undefined)).toEqual(geometry);
    expect(restored.operateWindow(sash, 'close', other, [])).toBeUndefined();
    expect(restored.operateWindow(sash, 'latch', other, [])).toBeDefined();
    expect(breakPane(restored, sash)?.outcome).toBe('broken');
    expect(sash.window?.open).toBe(false);
    expect(restored.operateWindow(sash, 'latch', other, [])).toBeUndefined();
    const saved = BlockEntities.restoreState(registry, structuredClone(restored.snapshotState())).byUid(sash.uid)!;
    expect(saved.window).toEqual(sash.window);
  });

  it('emits glass and shatter once, and floor glass survives owner destruction and encoded load', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    let { inventory, entity } = make('n', 'low', 'back', runtime.inventory);
    const sound = vi.fn();
    const floor: Vec3 = [2, 0, -1];
    const strike = () =>
      strikeWindowPane(
        {
          entities: inventory.entities,
          sound,
          emitItem: (type, count) => {
            expect(inventory.add(inventory.create(type, count), { kind: 'pile', pos: floor })).toBe(true);
          },
        },
        entity,
        { force: pane.breakForce, continuation: 0 },
        floor,
      );
    expect(strike()).toBe(true);
    expect(inventory.entities.byUid(entity.uid)).toBe(entity);
    expect(entity.window).toMatchObject({ pane: 'missing', frameRemnants: true, open: false });
    const glass = structuredClone(inventory.snapshotState().piles);
    expect(inventory.piles.get(floor.join(','))?.items.length).toBeGreaterThan(0);
    expect(sound).toHaveBeenCalledOnce();
    expect(strike()).toBe(false);
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
      version: formatVersion,
      contentLookup: (...query) => contentLookup(registry, ...query),
    });
    inventory = Inventory.restoreState(registry, decoded.snapshot.character.inventory);
    entity = inventory.entities.byUid(entity.uid)!;
    expect(strike()).toBe(false);
    expect(sound).toHaveBeenCalledOnce();
    expect(inventory.snapshotState().piles).toEqual(glass);
    inventory.entities.destroy(entity);
    const restored = Inventory.restoreState(registry, structuredClone(inventory.snapshotState()));
    expect(restored.entities.byUid(entity.uid)).toBeUndefined();
    expect(restored.snapshotState().piles).toEqual(glass);
    for (const { item } of restored.piles.get(floor.join(','))!.items) {
      expect(registry.items.get(item.type)?.groundHazard).toBe('sharp');
    }
  });

  it('stops breaking melee force while another source can carry residual force', () => {
    const hit = { force: pane.breakForce * 2, continuation: 0 };
    const melee = resolveDestructibleHit(0, hit, pane);
    const continuing = resolveDestructibleHit(0, { ...hit, continuation: 1 }, pane);
    expect(melee.outcome).toBe('broken');
    expect(melee.remainingForce).toBe(0);
    expect(continuing.remainingForce).toBe(hit.force - pane.forceTaken);
    expect(continuing.remainingForce).toBeGreaterThan(0);
  });

  it('passes a standing body within aperture leeway but requires crouching for a clearly shorter opening', () => {
    const { entities, entity } = make();
    const from = beside(entity, 'back');
    entities.operateWindow(entity, 'unlatch', from, []);
    entities.operateWindow(entity, 'open', from, []);
    const blockSize = 0.5;
    const spec = entities.defOf(entity).window!;
    const clearance = entity.size[1] - 2 * spec.frameWidthBlocks;
    const leeway = spec.passageLeewayMetres / blockSize;
    const shapeOf = apertureShapes(entities, () => false, blockSize);
    const cross = (height: number) => {
      const radius = spec.frameWidthBlocks * 2;
      const padding = radius * 2;
      const destination = entity.pos[2] + entity.size[2] + padding;
      const body = {
        pos: [
          entity.pos[0] + entity.size[0] / 2,
          entity.pos[1] + spec.frameWidthBlocks + CONTACT_SKIN * 2,
          entity.pos[2] - padding,
        ] as Vec3,
        vel: [0, 0, 0] as Vec3,
        halfWidth: radius,
        height,
        onGround: false,
      };
      stepBodyHorizontal(body, {
        dx: 0,
        dz: destination - body.pos[2],
        isSolid: entities.isSolid.bind(entities),
        params: { gravity: 0, stepHeight: 0, shapeOf },
      });
      return body.pos[2] > entity.pos[2] + entity.size[2];
    };
    expect(cross(clearance + leeway / 2)).toBe(true);
    expect(cross(clearance * 1.5)).toBe(false);
    expect(cross(clearance / 2)).toBe(true);
  });

  it('targets an open pane where drawn, but never targets the hole after it breaks', () => {
    const { entities, entity } = make();
    const from = beside(entity, 'back');
    entities.operateWindow(entity, 'unlatch', from, []);
    entities.operateWindow(entity, 'open', from, []);
    const { box } = windowParts(entity, entities.defOf(entity), 1, undefined).find(({ kind }) => kind === 'pane')!;
    const c = Math.cos(box.rotationY);
    const s = Math.sin(box.rotationY);
    const center: Vec3 = [
      box.pivot[0] + c * box.center[0] + s * box.center[2],
      box.pivot[1] + box.center[1],
      box.pivot[2] - s * box.center[0] + c * box.center[2],
    ];
    const normal: Vec3 = [s, 0, c];
    const origin = center.map((value, axis) => value + 2 * normal[axis]!) as Vec3;
    const options = {
      entities,
      origin,
      direction: normal.map((value) => -value) as Vec3,
      maxDistance: 3,
      blockSize: 1,
      isSolid: () => false,
    };
    expect(pickFurnitureHit(options)).toMatchObject({ entity, part: 'pane' });
    expect(entities.isSolid(2, 2, 0)).toBe(false);
    expect(breakPane(entities, entity)?.outcome).toBe('broken');
    expect(pickFurnitureHit(options)).toBeUndefined();
  });

  it('separates body, sight and lamp reach, retaining frame light obstruction after a pane breaks', () => {
    const { inventory, entities, entity } = make();
    const world = new World();
    const physical = worldSolid(world, registry, entities);
    const sight = worldOpaque(world, registry, entities);
    const light = worldLightBlocking(world, registry, entities);
    const source: Vec3 = [2.5, 2.5, -2.5];
    const reader: Vec3 = [2.5, 2.5, 2.5];
    expect(physical(2, 2, 0)).toBe(true);
    expect(sight(2, 2, 0)).toBe(false);
    expect(light(2, 2, 0)).toBe(false);
    expect(reaches(source, reader, physical)).toBe(false);
    expect(reaches(source, reader, sight)).toBe(true);
    expect(light(0, 2, 0)).toBe(true);
    const threshold = claimed(registry.senses, 'player')!.light.illumination.readingThreshold;
    const lamp = { pos: source, color: '#ffffff', intensity: threshold * 100_000, radius: 8 };
    const scene = {
      inventory,
      sky: { visibilityAt: () => 0 },
      gameHour: 0,
      cycle: registry.dayCycle!,
      fixtures: [lamp],
      isBlocking: light,
      blockSize: 0.5,
      holder: reader,
    };
    expect(litEnoughToRead({ ...scene, fixtures: [] }, reader)).toBe(false);
    expect(litEnoughToRead(scene, reader)).toBe(true);
    const cache = new LampReachCache({ world, entities }, light, 0.5, {
      cellBlocks: 1,
      rangeMetres: 8,
    });
    const before = cache.reachOf(lamp)!;
    expect(before.at(reader)).toBe(1);
    const sky = furnitureBounds(entities);
    breakPane(entities, entity);
    expect(physical(2, 2, 0)).toBe(false);
    expect(cache.isCurrent(lamp)).toBe(false);
    expect(cache.reachOf(lamp)!.at(reader)).toBe(1);
    expect(furnitureBounds(entities)).toEqual(sky);
  });

  it('revalidates the inside face at queued unlatch completion', () => {
    const { inventory, entities, entity } = make();
    let position = beside(entity, 'back');
    inventory.actorPosition = () => position;
    inventory.canReachEntity = () => true;
    const queue = new HandlingQueue(inventory);
    registerWindowAction(queue, inventory, () => []);
    queue.enqueueAction(WINDOW_ACTION, 'test unlatch', pane.handlingSimSeconds, {
      entityUid: entity.uid,
      operation: 'unlatch',
    });
    position = beside(entity, 'front');
    expect(queue.tick(pane.handlingSimSeconds).failed).toHaveLength(1);
    expect(entities.byUid(entity.uid)!.window?.latched).toBe(true);
  });

  it('rejects missing component state and impossible saved pane damage', () => {
    const { entities } = make();
    const state = structuredClone(entities.snapshotState());
    const { window: _window, ...withoutPane } = state.entities[0]!;
    state.entities[0] = withoutPane;
    expect(() => BlockEntities.restoreState(registry, state)).toThrow('Invalid window state');
    const damaged = structuredClone(entities.snapshotState());
    damaged.entities[0]!.window!.damage = pane.breakForce;
    expect(() => BlockEntities.restoreState(registry, damaged)).toThrow('Invalid window state');
  });

  it('renders shared glass parts without turning their transparency into an opaque shadow', () => {
    const { entities, entity } = make();
    const meshes = new FurnitureMeshes(0.5);
    try {
      const mesh = castsAndReceives(meshes.pieceMesh(entity, entities.defOf(entity)));
      const glass: Mesh[] = [];
      mesh.traverse((part) => {
        if (part instanceof Mesh && part.userData.transmitsLight) {
          glass.push(part);
        }
      });
      expect(glass.length).toBeGreaterThan(0);
      expect(glass.every((part) => !part.castShadow)).toBe(true);
      breakPane(entities, entity);
      expect(windowParts(entity, entities.defOf(entity), 0.5, undefined).some(({ kind }) => kind === 'pane')).toBe(
        false,
      );
    } finally {
      meshes.dispose();
    }
  });
});

describe('boarded windows', () => {
  it('keeps boards over a broken pane through a save file, shut from both faces and closing the hole', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    const made = boarded(runtime.inventory);
    breakPane(made.entities, made.entity);
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
      version: formatVersion,
      contentLookup: (...query) => contentLookup(registry, ...query),
    });
    const { entities } = Inventory.restoreState(registry, decoded.snapshot.character.inventory);
    const entity = entities.byUid(made.entity.uid)!;
    expect(entity).toMatchObject({ boarding: BOARDING, window: { pane: 'missing', open: false } });
    const boardedUp = coreMessage(registry, 'boardedUp');
    expect(entities.windowRefusal(entity, 'open', beside(entity, 'front'))).toBe(boardedUp);
    expect(entities.windowRefusal(entity, 'open', beside(entity, 'back'))).toBe(boardedUp);
    const world = new World();
    expect(worldSolid(world, registry, entities)(2, 2, 0)).toBe(true);
    expect(worldLightBlocking(world, registry, entities)(2, 2, 0)).toBe(true);
  });

  it('lands unaimed blows on the boards as the window’s own damage, while aimed glass still breaks', () => {
    const plain = make().entity;
    const { entities, entity } = boarded();
    expect(blowLandsOnPane(plain, undefined)).toBe(true);
    expect(blowLandsOnPane(entity, undefined)).toBe(false);
    expect(blowLandsOnPane(entity, 'board')).toBe(false);
    expect(blowLandsOnPane(entity, 'pane')).toBe(true);
    expect(entities.bash(entity, entities.defOf(entity).breach.durability)).toBe('ruined');
  });

  it('refuses boards saved on an open window, since the boards hold its sash shut', () => {
    const { entities, entity } = make();
    const from = beside(entity, 'back');
    entities.operateWindow(entity, 'unlatch', from, []);
    entities.operateWindow(entity, 'open', from, []);
    const state = structuredClone(entities.snapshotState());
    state.entities[0]!.boarding = BOARDING;
    expect(() => BlockEntities.restoreState(registry, state)).toThrow('Invalid boarding');
  });
});
