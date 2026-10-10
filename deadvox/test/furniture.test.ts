import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box3, type Group, type Matrix4, type Mesh, type MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities, doorPanel, searchTime } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { pickFurniture } from '../src/core/furniturePick.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { HANDLING, Inventory } from '../src/core/inventory.ts';
import type { Body } from '../src/core/physics.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import {
  cellsOf,
  compileTemplate,
  type Facing,
  placedPieces,
  stampPlacement,
  type Turn,
} from '../src/core/templates.ts';
import { DOOR_ACTION, registerDoorAction } from '../src/game/doorAction.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);

const cubeCorners = (point: (x: number, y: number, z: number) => Vector3): Vector3[] => {
  const corners: Vector3[] = [];
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        corners.push(point(x, y, z));
      }
    }
  }
  return corners;
};

const renderedCorners = (matrix: Matrix4): Vector3[] =>
  cubeCorners((x, y, z) => new Vector3(x, y, z).applyMatrix4(matrix));

const panelCorners = (box: ReturnType<typeof doorPanel>): Vector3[] =>
  cubeCorners((x, y, z) =>
    new Vector3(box.center[0] + x * box.size[0], box.center[1] + y * box.size[1], box.center[2] + z * box.size[2])
      .applyAxisAngle(new Vector3(0, 1, 0), box.rotationY)
      .add(new Vector3(...box.pivot)),
  );

const maxCornerError = (expected: Vector3[], actual: Vector3[]): number =>
  Math.max(...expected.map((point) => Math.min(...actual.map((other) => point.distanceTo(other)))));

/** A cupboard next to a player in a hoodie, and a can of beans in the cupboard. */
const kitchen = () => {
  const inv = new Inventory(registry);
  const hoodie = inv.create('hoodie');
  inv.worn.torso = hoodie;
  const cupboard = inv.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' }, [
    { type: 'canned_beans', count: 1, condition: 1 },
  ])!;
  const [beans] = cupboard.pockets![0]!.map((p) => p.item);
  return { inv, hoodie, cupboard, beans: beans! };
};

describe('furniture', () => {
  it('holds what worldgen rolled for it, once', () => {
    const { inv, cupboard, beans } = kitchen();
    expect(inv.locate(beans)).toMatchObject({ kind: 'furniture', entity: cupboard, pocket: 0 });
    expect(inv.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' })).toBeUndefined();
    expect([...inv.entities.all]).toHaveLength(1);
    expect(inv.entities.at(1, 1, 0)).toBe(cupboard);
    expect(inv.entities.at(2, 0, 0)).toBeUndefined();
  });

  it('has to be searched before anything moves in or out', () => {
    const { inv, hoodie, cupboard, beans } = kitchen();
    const toPocket = { kind: 'pocket', owner: hoodie, pocket: 0 } as const;
    expect(inv.plan(beans, toPocket)).toEqual({ ok: false, reason: 'Search it first' });
    const matches = inv.create('matches');
    inv.add(matches, toPocket);
    expect(inv.plan(matches, { kind: 'furniture', entity: cupboard, pocket: 0 })).toMatchObject({ ok: false });
    inv.entities.markSearched(cupboard);
    const plan = inv.plan(beans, toPocket);
    expect(plan.ok).toBe(true);
    const def = registry.furniture.get('kitchen_cupboard')!;
    const [w, h] = registry.items.get('canned_beans')!.size;
    const cells = w * h;
    const expected =
      def.container!.pockets[0]!.handlingSimSeconds + inv.pocketHandling(hoodie, 0) + 2 * HANDLING.perCell * cells;
    expect(plan.ok && plan.time).toBeCloseTo(expected);
  });

  it('is out of reach when the game says so', () => {
    const { inv, hoodie, cupboard, beans } = kitchen();
    inv.entities.markSearched(cupboard);
    inv.canReachEntity = () => false;
    expect(inv.plan(beans, { kind: 'pocket', owner: hoodie, pocket: 0 })).toEqual({
      ok: false,
      reason: 'Too far away',
    });
  });

  it('searching takes a moment, longer for bigger containers', () => {
    const { inv, cupboard } = kitchen();
    const queue = new HandlingQueue(inv);
    queue.registerAction('test.search', () => {
      inv.entities.markSearched(cupboard);
    });
    const time = searchTime(registry.furniture.get('kitchen_cupboard')!);
    expect(time).toBeGreaterThanOrEqual(1);
    expect(time).toBeLessThan(searchTime(registry.furniture.get('wardrobe')!));
    expect(searchTime(registry.furniture.get('wardrobe')!)).toBeLessThanOrEqual(3);
    queue.enqueueAction('test.search', 'Search', time, { entityUid: cupboard.uid });
    queue.tick(time - 0.1);
    expect(cupboard.searched).toBe(false);
    const { done } = queue.tick(0.2);
    expect(done).toHaveLength(1);
    expect(cupboard.searched).toBe(true);
  });

  it('tagged door jobs play open, close, and blocked-close sounds at the door centre', () => {
    const inv = new Inventory(registry);
    const door = inv.furnish({ type: 'wood_door', pos: [4, 0, 0], size: [2, 4, 1], facing: 'n' })!;
    const queue = new HandlingQueue(inv);
    const bodyAt = (pos: [number, number, number]): Body => ({
      pos,
      vel: [0, 0, 0],
      halfWidth: 0.2,
      height: 1.8,
      onGround: true,
    });
    let player = bodyAt([0, 0, 0]);
    const sounds: { event: string; position: [number, number, number] }[] = [];
    registerDoorAction({
      queue,
      inventory: inv,
      player: () => player,
      others: () => [],
      playWorldSound: (event, position) => {
        sounds.push({ event, position: [...position] });
      },
    });
    const enqueue = (closing: boolean) =>
      queue.enqueueAction(DOOR_ACTION, 'Door', 0.1, { entityUid: door.uid, closing });

    enqueue(false);
    queue.tick(0.1);
    expect(door.open).toBe(true);
    expect(sounds).toEqual([{ event: 'door_open', position: [5, 2, 0.5] }]);

    enqueue(true);
    queue.tick(0.1);
    expect(door.open).toBe(false);
    expect(sounds[1]).toEqual({ event: 'door_close', position: [5, 2, 0.5] });

    enqueue(false);
    queue.tick(0.1);
    player = bodyAt([5, 0, 0.5]);
    enqueue(true);
    expect(queue.tick(0.1).failed[0]?.reason).toBe("You're in the way");
    expect(door.open).toBe(true);
    expect(sounds[3]).toEqual({ event: 'door_blocked_close', position: [5, 2, 0.5] });
  });

  it('doors stop you only while closed', () => {
    const inv = new Inventory(registry);
    const door = inv.furnish({ type: 'wood_door', pos: [4, 0, 0], size: [2, 4, 1], facing: 'n' })!;
    expect(inv.entities.isSolid(5, 3, 0)).toBe(true);
    inv.entities.setOpen(door, true);
    expect(inv.entities.isSolid(5, 3, 0)).toBe(false);
    const bed = inv.furnish({ type: 'bed', pos: [0, 0, 4], size: [2, 1, 4], facing: 'n' })!;
    expect(inv.entities.isSolid(0, 0, 4)).toBe(true);
    expect(bed.pockets).toBeUndefined();
  });

  it('picks a door by its panel and lets an open doorway ray reach furniture behind it', () => {
    const entities = new BlockEntities(registry);
    const door = entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
    const empty = () => false;
    const pick = (origin: [number, number, number], direction: [number, number, number], maxDistance: number) =>
      pickFurniture({ entities, origin, direction, maxDistance, blockSize: 0.5, isSolid: empty });
    const closedHit = pick([5, 3.24, 4], [0, 0, -1], 8);
    expect(closedHit).toBe(door);
    const closedOffPanel = pick([8, 3.24, 0.1], [-1, 0, 0], 8);
    expect(closedOffPanel).toBeUndefined();

    entities.setOpen(door, true);
    const swungHit = pick([8, 3.24, 1.5], [-1, 0, 0], 10);
    expect(swungHit).toBe(door);

    const fridge = entities.add({ type: 'fridge', pos: [5, 1, -4], size: [2, 4, 2], facing: 'n' })!;
    const throughDoor = pick([5, 3.24, 4], [0, 0, -1], 12);
    expect(throughDoor).toBe(fridge);
    expect(throughDoor).not.toBe(door);
    const stoppedByWall = pickFurniture({
      entities,
      origin: [5, 3.24, 4],
      direction: [0, 0, -1],
      maxDistance: 12,
      blockSize: 0.5,
      isSolid: (x, y, z) => x === 5 && y === 3 && z === 2,
    });
    expect(stoppedByWall).toBeUndefined();
  });

  it('keeps each shaped furniture instance to one draw object', () => {
    const fixture = {
      id: 'fixture_shaped_furniture',
      name: 'Fixture shaped furniture',
      size: [1, 2, 1] as [number, number, number],
      color: '#123456',
      shape: [
        { position: [0.1, 0, 0.1], size: [0.3, 0.5, 0.3] },
        { position: [0.6, 0.5, 0.1], size: [0.3, 0.5, 0.3] },
      ],
    };
    const { registry: fixtureRegistry, issues } = buildRegistry([
      { source: 'furniture-render-fixture.json', data: { furniture: [fixture] } },
    ]);
    expect(issues).toEqual([]);

    const entities = new BlockEntities(fixtureRegistry);
    for (const x of [0, 3, 6]) {
      entities.add({ type: fixture.id, pos: [x, 0, 0], size: fixture.size, facing: 'n' });
    }
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    furniture.sync(entities);

    const meshes = furniture.group.children as Mesh[];
    expect(meshes).toHaveLength(3);
    expect(meshes.every((mesh) => mesh.isMesh && mesh.geometry.groups.length === 0)).toBe(true);
    expect(meshes.every((mesh) => !Array.isArray(mesh.material))).toBe(true);
  });

  it('renders a nonblocking readable sign as a thin board facing into the room', () => {
    const entities = new BlockEntities(registry);
    const board = entities.add({
      type: 'medical_research_notice',
      pos: [1, 2, 20],
      size: [1, 2, 2],
      facing: 'e',
    })!;
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    furniture.sync(entities);
    const mesh = furniture.group.children[0] as Mesh;
    expect(mesh.scale.x).toBeLessThan(BLOCK_SIZE);
    expect(mesh.scale.z).toBeGreaterThan(mesh.scale.x);
    expect(mesh.position.x - mesh.scale.x / 2).toBeCloseTo(board.pos[0] * BLOCK_SIZE);
  });

  it('picks the closed HQ safe only through its visible door', () => {
    const definition = registry.furniture.get('camp_hq_safe')!;
    const entities = new BlockEntities(registry);
    const safe = entities.add({ type: definition.id, pos: [4, 1, 8], size: definition.size, facing: 'n' })!;
    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    furniture.sync(entities);
    furniture.group.updateMatrixWorld(true);

    const assembly = furniture.group.children[0] as Group;
    expect(assembly.children).toHaveLength(2);
    const body = assembly.children[0] as Mesh;
    const door = assembly.children[1] as Group;
    expect(door.children).toHaveLength(2);
    const panel = door.children[0] as Mesh;
    const handle = door.children[1] as Mesh;
    const bodyBounds = new Box3().setFromObject(body);
    const panelBounds = new Box3().setFromObject(panel);
    const bodyMaterial = body.material as MeshLambertMaterial;
    const panelMaterial = panel.material as MeshLambertMaterial;
    const handleMaterial = handle.material as MeshLambertMaterial;
    expect(panelMaterial.color.getHex()).not.toBe(bodyMaterial.color.getHex());
    expect(handleMaterial.color.getHex()).not.toBe(panelMaterial.color.getHex());
    expect(panelBounds.min.z).toBeLessThan(bodyBounds.min.z);
    expect(panelBounds.max.z).toBeCloseTo(bodyBounds.min.z);
    const pick = (origin: [number, number, number], direction: [number, number, number], maxDistance: number) =>
      pickFurniture({ entities, origin, direction, maxDistance, blockSize: BLOCK_SIZE, isSolid: () => false });
    expect(pick([5.5, 2.5, 7], [0, 0, 1], 3)).toBe(safe);
    expect(pick([3, 2, 9], [1, 0, 0], 3)).toBeUndefined();
    expect(pick([5.5, 2.5, 11], [0, 0, -1], 6)).toBeUndefined();
  });

  it('keeps the open HQ safe body solid and pickable while its door swings outward', () => {
    const definition = registry.furniture.get('camp_hq_safe')!;
    const entities = new BlockEntities(registry);
    const safe = entities.add({ type: definition.id, pos: [4, 1, 8], size: definition.size, facing: 'n' })!;
    entities.setOpen(safe, true);

    expect(entities.blocks(safe)).toBe(true);
    expect(entities.isSolid(5, 2, 8)).toBe(true);
    expect(
      pickFurniture({
        entities,
        origin: [5.5, 2.5, 7],
        direction: [0, 0, 1],
        maxDistance: 3,
        blockSize: BLOCK_SIZE,
        isSolid: () => false,
      }),
    ).toBe(safe);

    const furniture = new FurnitureMeshes(BLOCK_SIZE);
    furniture.sync(entities);
    furniture.group.updateMatrixWorld(true);
    const assembly = furniture.group.children[0] as Group;
    const bodyBounds = new Box3().setFromObject(assembly.children[0]!);
    const door = assembly.children[1] as Group;
    const panelBounds = new Box3().setFromObject(door.children[0]!);
    expect(panelBounds.max.x).toBeLessThan(bodyBounds.min.x);
    expect(panelBounds.max.z).toBeLessThanOrEqual(bodyBounds.min.z);
  });

  it('shares the renderer door-panel transform with the core box within 1 mm for every facing/state', () => {
    const entities = new BlockEntities(registry);
    const facings: Facing[] = ['n', 'e', 's', 'w'];
    const doors = facings.map(
      (facing, index) =>
        entities.add({
          type: 'wood_door',
          pos: [index * 4, 1, 0],
          size: facing === 'n' || facing === 's' ? [2, 4, 1] : [1, 4, 2],
          facing,
        })!,
    );
    const furniture = new FurnitureMeshes(0.5);
    for (const open of [false, true]) {
      for (const door of doors) {
        entities.setOpen(door, open);
      }
      furniture.sync(entities);
      furniture.group.updateMatrixWorld(true);
      for (let index = 0; index < doors.length; index++) {
        const door = doors[index]!;
        const box = doorPanel(door, 0.5);
        const group = furniture.group.children[index]!;
        const panel = group.children[0] as import('three').Mesh;
        const error = maxCornerError(panelCorners(box), renderedCorners(panel.matrixWorld));
        expect(error, `${door.facing} door ${open ? 'open' : 'closed'}`).toBeLessThan(0.001);
      }
    }
  });
});

describe('templates', () => {
  /** An asymmetric template: an L of blocks, and a wardrobe facing east. */
  const template: TemplateDef = {
    id: 'l_shape',
    size: [3, 5, 2],
    palette: { '#': 'brick', '.': 'air', R: { furniture: 'wardrobe', facing: 'e' } },
    layers: [
      ['##.', '#..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
      ['R..', 'R..'],
    ],
  };

  it('turns by quarter turns: stamped blocks and pieces agree', () => {
    const compiled = compileTemplate(registry, template);
    expect(compiled.pieces).toEqual([
      { furniture: 'wardrobe', loot: 'wardrobe', facing: 'e', pos: [0, 1, 0], size: [1, 4, 2] },
    ]);
    const brick = registry.blockIds.get('brick')!;
    const facings = ['e', 's', 'w', 'n'];
    for (const turn of [0, 1, 2, 3] as Turn[]) {
      const chunk = new Chunk(0, 0, 0);
      const placement = { template: compiled, origin: [4, 2, 4] as [number, number, number], turn };
      stampPlacement(chunk, placement);
      const bricks = [...cellsOf([12, 1, 12])]
        .filter(([x, , z]) => chunk.get(x, 2, z) === brick)
        .map(([x, , z]) => [x, z] as const);
      // Three bricks in an L inside the turned 3 × 2 (or 2 × 3) footprint.
      expect(bricks).toHaveLength(3);
      const [piece] = placedPieces(placement);
      expect(piece!.facing).toBe(facings[turn]);
      const size = turn % 2 === 0 ? [1, 4, 2] : [2, 4, 1];
      expect(piece!.size).toEqual(size);
      // The wardrobe stands on the column where the template's corner brick is.
      const { pos } = piece!;
      const corner = bricks.find(
        ([x, z]) => x >= pos[0] && x < pos[0] + size[0]! && z >= pos[2] && z < pos[2] + size[2]!,
      );
      expect(corner, `turn ${turn}`).toBeDefined();
    }
  });
});
