import { expect, it } from 'vitest';
import { BlockEntities, type BlockEntity } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { pickFurniture } from '../src/core/furniturePick.ts';
import { type Pose, rotatedSize, rotationOf } from '../src/core/orientation.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { createPlayerBody, physicsFor, steer } from '../src/game/player.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureMaterials, fixtureSounds } from './economyFixtures.ts';

const half = makeScale(0.5);
const base = baseRegistry();
const intact = [...base.furniture.values()].find((def) => def.vehicle?.removed.length === 0)!;
const wheel = BLUEPRINTS[intact.vehicle!.blueprint]!.fittings.find(({ motion }) => motion === 'spin')!.id;

// A loading frame on three thin legs under a roof, open beneath the roof wide and tall enough for a player. The
// missing fourth leg leaves it no mirror symmetry.
const post = (x: number, z: number) => ({ position: [x, 0, z] as Vec3, size: [0.25, 4.5, 0.25] as Vec3 });
const frame = {
  id: 'fixture_frame',
  name: 'Frame',
  size: [5, 5, 3] as Vec3,
  color: '#5b605c',
  shape: [post(0, 0), post(4.75, 0), post(4.75, 2.75), { position: [0, 4.5, 0] as Vec3, size: [5, 0.5, 3] as Vec3 }],
  solidFill: 0.01,
  breach: fixtureBreach(),
  material: FIXTURE_MATERIAL,
};

const fixtures: ContentFile = {
  furnitureMaterials: fixtureMaterials(),
  sounds: fixtureSounds(),
  furniture: [
    ...['fixture_car', 'fixture_car_wheel_off'].map((id, at) => ({
      id,
      name: 'Car',
      size: [...intact.size] as Vec3,
      color: '#5b605c',
      vehicle: { ...intact.vehicle!, removed: at === 0 ? [] : [wheel] },
      breach: fixtureBreach(),
      material: FIXTURE_MATERIAL,
    })),
    frame,
  ],
};
const { registry, issues } = buildRegistry([{ source: 'fixture-cars.json', data: fixtures }]);

const place = (entities: BlockEntities, type: string, pose: Pose): BlockEntity =>
  entities.add({
    type,
    pos: [0, 0, 0],
    size: rotatedSize(entities.registry.furniture.get(type)!.size, rotationOf(pose)),
    facing: pose.facing,
    ...(pose.tip && { tip: pose.tip }),
  })!;

/** The piece's blocking cells, as doubled offsets from its box's centre, read through `isSolid` and `blockingBoxes`. */
const solidOffsets = (entities: BlockEntities, entity: BlockEntity) => {
  const offset = (cell: Readonly<Vec3>) =>
    cell.map((at, axis) => 2 * (at + 0.5 - entity.pos[axis]!) - entity.size[axis]!).join(',');
  const solid = new Set<string>();
  const [w, h, d] = entity.size;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        if (entities.isSolid(x, y, z)) {
          solid.add(offset([x, y, z]));
        }
      }
    }
  }
  return { solid, boxes: new Set(entities.blockingBoxes(entity).map(({ pos }) => offset(pos))) };
};

const turned = (offsets: ReadonlySet<string>, pose: Pose) => {
  const rotation = rotationOf(pose);
  return new Set(
    [...offsets].map((key) => {
      const own = key.split(',').map(Number);
      return [0, 1, 2].map((world) => rotation.reduce((sum, axis, a) => sum + own[a]! * axis[world]!, 0)).join(',');
    }),
  );
};

const facings = ['n', 'e', 's', 'w'] as const;
const tips = ['back', 'front', 'left', 'right', 'top'] as const;
const poses: Pose[] = facings.flatMap((facing) => [{ facing }, ...tips.map((tip) => ({ facing, tip }))]);

it('stands a player dropped on the bonnet below the box top and stops a jump at the cabin', () => {
  const entities = new BlockEntities(base);
  const car = entities.add({ type: intact.id, pos: [0, 0, 0], size: [...intact.size], facing: 'n' })!;
  const solid = (x: number, y: number, z: number) => y < 0 || entities.isSolid(x, y, z);
  const [width, height, depth] = car.size;
  const physics = physicsFor(half);
  const intent = (forward: number, jump: boolean) => ({ forward, right: 0, jump, sprint: false, walk: false });

  // A north-facing piece's front, the bonnet, is its low-z face. Dropping onto it, rather than jumping
  // at it, keeps the test free of run and jump tuning.
  const front = createPlayerBody(half, width / 2, height + 1, depth / 4);
  for (let step = 0; step < 600 && !front.onGround; step++) {
    stepBody(front, 1 / 60, solid, physics);
  }
  const under = front.pos.map((at, axis) => Math.floor(axis === 1 ? at - 0.01 : at)) as Vec3;
  expect(front.onGround).toBe(true);
  expect(entities.at(...under)).toBe(car);
  expect(front.pos[1]).toBeLessThan(car.pos[1] + height);

  const side = createPlayerBody(half, -4, 0, depth / 2);
  for (let step = 0; step < 240; step++) {
    steer(side, half, -Math.PI / 2, intent(1, side.onGround));
    stepBody(side, 1 / 60, solid, physics);
  }
  expect(side.pos[0] + side.halfWidth).toBeLessThanOrEqual(car.pos[0]);
});

it('lets a pick through the air above the bonnet miss the car and a pick at the cabin hit it', () => {
  const entities = new BlockEntities(base);
  const car = entities.add({ type: intact.id, pos: [0, 0, 0], size: [...intact.size], facing: 'n' })!;
  const [width, height, depth] = car.size;
  const top = height - 1;
  const rowSolid = (y: number, z: number) =>
    Array.from({ length: width }, (_, x) => x).some((x) => entities.isSolid(x, y, z));
  const rows = Array.from({ length: depth }, (_, z) => z);
  const overBonnet = rows.find((z) => !rowSolid(top, z) && rowSolid(top - 1, z));
  const cabin = rows.find((z) => rowSolid(top, z));
  expect(overBonnet).toBeDefined();
  expect(cabin).toBeDefined();
  // A level ray across the car's top layer, in its box the whole way.
  const pick = (z: number) =>
    pickFurniture({
      entities,
      origin: [-2, top + 0.5, z + 0.5],
      direction: [1, 0, 0],
      maxDistance: width + 4,
      blockSize: half.blockSize,
      isSolid: (x, y, at) => entities.isSolid(x, y, at),
    });
  expect(pick(overBonnet!)).toBeUndefined();
  expect(pick(cabin!)).toBe(car);
});

const placedOffsets = (type: string, pose: Pose) => {
  const entities = new BlockEntities(registry);
  return solidOffsets(entities, place(entities, type, pose));
};

it('clears the cells of a removed fitting and nothing else', () => {
  const whole = placedOffsets('fixture_car', { facing: 'n' }).solid;
  const less = placedOffsets('fixture_car_wheel_off', { facing: 'n' }).solid;
  expect([...less].every((cell) => whole.has(cell))).toBe(true);
  expect(less.size).toBeLessThan(whole.size);
});

it.each(['fixture_car_wheel_off', frame.id])('turns and tips the solid cells of %s with the piece', (type) => {
  expect(issues).toEqual([]);
  const upright = placedOffsets(type, { facing: 'n' }).solid;
  // Neither fixture has mirror symmetry, so no axis can be read the wrong way round unseen.
  for (const axis of [0, 1, 2]) {
    const mirrored = [...upright].map((key) =>
      key
        .split(',')
        .map((at, i) => (i === axis ? -1 : 1) * Number(at))
        .join(','),
    );
    expect(mirrored.every((cell) => upright.has(cell))).toBe(false);
  }
  for (const pose of poses) {
    const { solid, boxes } = placedOffsets(type, pose);
    expect({ pose, solid: [...solid].sort() }).toEqual({ pose, solid: [...turned(upright, pose)].sort() });
    expect([...boxes].sort()).toEqual([...solid].sort());
  }
});

const walk = (entities: BlockEntities, from: Vec3, yaw: number) => {
  const solid = (x: number, y: number, z: number) => y < 0 || entities.isSolid(x, y, z);
  const physics = physicsFor(half);
  const body = createPlayerBody(half, ...from);
  for (let step = 0; step < 240; step++) {
    steer(body, half, yaw, { forward: 1, right: 0, jump: false, sprint: false, walk: false });
    stepBody(body, 1 / 60, solid, physics);
  }
  return body;
};

it('lets a player walk between the legs of a shaped piece and stops them at a leg', () => {
  const entities = new BlockEntities(registry);
  const placed = entities.add({ type: frame.id, pos: [0, 0, 0], size: [...frame.size], facing: 'n' })!;
  const [width, , depth] = placed.size;
  // Yaw π walks toward +z, under the roof between the legs; yaw -π/2 walks toward +x, into the first leg.
  const through = walk(entities, [width / 2, 0, -3], Math.PI);
  expect(through.pos[2] - through.halfWidth).toBeGreaterThan(placed.pos[2] + depth);
  const into = walk(entities, [-4, 0, 0.5], -Math.PI / 2);
  expect(into.pos[0] + into.halfWidth).toBeLessThanOrEqual(placed.pos[0]);
});

it('lets a pick between the legs of a shaped piece miss it and a pick at its roof hit it', () => {
  const entities = new BlockEntities(registry);
  const placed = entities.add({ type: frame.id, pos: [0, 0, 0], size: [...frame.size], facing: 'n' })!;
  const [width, height, depth] = placed.size;
  // A level ray along the piece's depth, in its box the whole way.
  const pick = (y: number) =>
    pickFurniture({
      entities,
      origin: [width / 2, y, -2],
      direction: [0, 0, 1],
      maxDistance: depth + 4,
      blockSize: half.blockSize,
      isSolid: (x, at, z) => entities.isSolid(x, at, z),
    });
  expect(pick(1.5)).toBeUndefined();
  expect(pick(height - 0.5)).toBe(placed);
});
