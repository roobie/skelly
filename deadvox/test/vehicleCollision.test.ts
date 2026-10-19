import { expect, it } from 'vitest';
import { BlockEntities, type BlockEntity } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type Pose, rotatedSize, rotationOf } from '../src/core/orientation.ts';
import { stepBody } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { createPlayerBody, physicsFor, steer } from '../src/game/player.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';
import { baseRegistry } from './baseRegistry.ts';

const half = makeScale(0.5);
const base = baseRegistry();
const intact = [...base.furniture.values()].find((def) => def.vehicle?.removed.length === 0)!;
const wheel = BLUEPRINTS[intact.vehicle!.blueprint]!.fittings.find(({ motion }) => motion === 'spin')!.id;

const fixtures: ContentFile = {
  furniture: ['fixture_car', 'fixture_car_wheel_off'].map((id, at) => ({
    id,
    name: 'Car',
    size: [...intact.size] as Vec3,
    color: '#5b605c',
    vehicle: { ...intact.vehicle!, removed: at === 0 ? [] : [wheel] },
  })),
};
const { registry } = buildRegistry([{ source: 'fixture-cars.json', data: fixtures }]);

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

it('lets a jump at the bonnet land on it and stops a jump at the cabin', () => {
  const entities = new BlockEntities(base);
  const car = entities.add({ type: intact.id, pos: [0, 0, 0], size: [...intact.size], facing: 'n' })!;
  const solid = (x: number, y: number, z: number) => y < 0 || entities.isSolid(x, y, z);
  const [width, , depth] = car.size;
  const physics = physicsFor(half);
  const intent = (forward: number, jump: boolean) => ({ forward, right: 0, jump, sprint: false, walk: false });

  // A north-facing piece's front, the bonnet, is its low-z face.
  const front = createPlayerBody(half, width / 2, 0, -6);
  let jumped = false;
  for (let step = 0; step < 240; step++) {
    const landed = jumped && front.onGround;
    const jump: boolean = !jumped && front.onGround && front.pos[2] + front.halfWidth >= -2.4;
    jumped ||= jump;
    steer(front, half, Math.PI, intent(landed ? 0 : 1, jump));
    stepBody(front, 1 / 60, solid, physics);
  }
  const under = front.pos.map((at, axis) => Math.floor(axis === 1 ? at - 0.01 : at)) as Vec3;
  expect(front.onGround).toBe(true);
  expect(entities.at(...under)).toBe(car);

  const side = createPlayerBody(half, -4, 0, depth / 2);
  for (let step = 0; step < 240; step++) {
    steer(side, half, -Math.PI / 2, intent(1, side.onGround));
    stepBody(side, 1 / 60, solid, physics);
  }
  expect(side.pos[0] + side.halfWidth).toBeLessThanOrEqual(car.pos[0]);
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

it('turns and tips the solid cells with the piece', () => {
  const upright = placedOffsets('fixture_car_wheel_off', { facing: 'n' }).solid;
  // With one wheel off the piece has no mirror symmetry, so no axis can be read the wrong way round unseen.
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
    const { solid, boxes } = placedOffsets('fixture_car_wheel_off', pose);
    expect({ pose, solid: [...solid].sort() }).toEqual({ pose, solid: [...turned(upright, pose)].sort() });
    expect([...boxes].sort()).toEqual([...solid].sort());
  }
});
