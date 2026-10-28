import { expect, it, vi } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { sightedFirearmModel } from '../src/core/firearmSight.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { guardLean, type LeanBox, leanFrame } from '../src/core/lean.ts';
import { playerLeanBoxes } from '../src/core/leanCollision.ts';
// biome-ignore lint/performance/noNamespaceImport: Observe expensive geometry preparation across the module boundary.
import * as geometry from '../src/core/leanGeometry.ts';
import { playerAdsPose } from '../src/core/playerAdsPose.ts';
import { playerHeldSeatFrame, playerLookPose } from '../src/core/playerLookPose.ts';
import type { PlayerStance } from '../src/core/playerStance.ts';
import { add, axisRotation, multiplyRotation, rotateVector, sub } from '../src/core/spatial.ts';
import { baseRegistry } from './baseRegistry.ts';

type Input = Parameters<typeof playerLeanBoxes>[0];

const fixture = (side: HandSide = 'right', stance: PlayerStance = 'standing', progress = 0, ads = false) => {
  const registry = baseRegistry();
  const inventory = new Inventory(registry);
  const [type] = [...registry.items].find(([, def]) => def.firearm && def.twoHanded)!;
  const item = inventory.create(type);
  if (!inventory.add(item, { kind: 'hand', side })) {
    throw new Error('Cannot equip the collision fixture');
  }
  const figure = registry.figures.get('player')!;
  const tuning = registry.player.get('player')!.lean;
  const { loweredPitchRadians } = [...registry.skills.values()].find((skill) => skill.combat?.firearms)!.combat!
    .firearms!;
  let feet: Vec3 = [0, 2, 0];
  const input = (amount: number, yaw = 0, pitch = 0): Input => {
    const aimFrame = { ...NEUTRAL_AIM, yaw: yaw + 0.02, pitch: pitch - 0.03 };
    return {
      inventory,
      feet,
      blockSize: 0.5,
      yaw,
      pitch,
      aimFrame,
      ads,
      progress: () => progress,
      loweredPitchRadians,
      pose: playerLookPose({
        figure,
        models: registry.models,
        stance,
        pitch,
        ads: playerAdsPose(inventory, ads, aimFrame),
        lean: leanFrame(amount, tuning),
      }),
    };
  };
  return {
    input,
    side,
    tuning,
    setFeet: (value: Vec3) => {
      feet = value;
    },
  };
};

// Independent corner projection catches an undersized envelope even when live play and replay share the same bug.
const cornerBoxes = (input: Input, side: HandSide): LeanBox[] => {
  const { inventory, pose, blockSize, feet, yaw, pitch } = input;
  const item = inventory.hands[side]!;
  const model = sightedFirearmModel(inventory.registry, item)!;
  const figure = inventory.registry.figures.get('player')!;
  const yawTurn = axisRotation([0, 1, 0], yaw);
  const viewTurn = multiplyRotation(yawTurn, axisRotation([1, 0, 0], pitch));
  const eye = add(feet, rotateVector(yawTurn, pose.eye).map((v) => v / blockSize) as Vec3);
  const pivot: Vec3 = [pose.hip[0], pose.hip[1] - pose.hipDrop, pose.hip[2]];
  const eyeRadius = Math.hypot(...sub((pose.unleaned ?? pose).eye, pivot));
  const transform = heldFirearmTransform({
    holds: figure.holds,
    model,
    side,
    leadingSide: side,
    twoHanded: true,
    progress: input.progress(item.uid),
    aimingDownSights: input.ads,
    aimFrame: input.aimFrame,
    lookPitchRadians: pitch,
    loweredPitchRadians: input.loweredPitchRadians,
    stockSeat: pose.stockSeats[side],
    seatFrame: playerHeldSeatFrame(pose, pitch),
    adsEyes: pose.eyes,
    leanRollRadians: pose.lateralLean?.frame.rollRadians,
  });
  const result: LeanBox[] = [{ min: eye, max: eye, radius: eyeRadius / blockSize }];
  for (const primitive of geometry.prepareLeanGeometry(inventory.registry, item, model)) {
    const local = primitive.corners.map((point) =>
      add(
        transform.rootOffset,
        point.map((_, axis) =>
          transform.rootRotation.reduce((sum, column, index) => sum + column[axis]! * point[index]!, 0),
        ) as Vec3,
      ),
    );
    const world = local.map((point) => add(eye, rotateVector(viewTurn, point).map((v) => v / blockSize) as Vec3));
    result.push({
      min: [0, 1, 2].map((axis) => Math.min(...world.map((point) => point[axis]!))) as Vec3,
      max: [0, 1, 2].map((axis) => Math.max(...world.map((point) => point[axis]!))) as Vec3,
      radius: (eyeRadius + Math.max(...local.map((point) => Math.hypot(...point)))) / blockSize,
    });
  }
  return result;
};

it('keeps physical gun geometry prepared while both mouse-look axes change', () => {
  const f = fixture();
  const prepare = vi.spyOn(geometry, 'prepareLeanGeometry');
  try {
    const initial = playerLeanBoxes(f.input(1));
    expect(prepare.mock.calls.length).toBeGreaterThan(0);
    prepare.mockClear();
    for (const [yaw, pitch] of [
      [0.1, -0.2],
      [-0.3, 0.4],
      [0.7, -0.6],
    ]) {
      const turned = playerLeanBoxes(f.input(1, yaw, pitch));
      expect(turned[1]!.min).not.toEqual(initial[1]!.min);
    }
    expect(prepare.mock.calls.length).toBe(0);
  } finally {
    prepare.mockRestore();
  }
});

it.each([
  { side: 'right', stance: 'standing', progress: 0, ads: false, yaw: 0.23, pitch: -0.4, amount: 0.8 },
  { side: 'left', stance: 'crouching', progress: 0.5, ads: false, yaw: -0.6, pitch: 0.2, amount: -0.6 },
  { side: 'right', stance: 'prone', progress: 1, ads: false, yaw: 0.8, pitch: -0.3, amount: 0 },
  { side: 'left', stance: 'standing', progress: 1, ads: true, yaw: -0.9, pitch: -0.2, amount: -0.8 },
] as const)(
  'matches corner-projected collision for $side $stance ready=$progress ADS=$ads',
  ({ side, stance, progress, ads, yaw, pitch, amount }) => {
    const f = fixture(side, stance, progress, ads);
    const input = f.input(amount, yaw, pitch);
    const expected = cornerBoxes(input, side);
    const actual = playerLeanBoxes(input);
    expect(actual.length).toBe(expected.length);
    expect(actual.length).toBeGreaterThan(1);
    for (const [index, box] of actual.entries()) {
      for (const axis of [0, 1, 2]) {
        expect(box.min[axis]).toBeCloseTo(expected[index]!.min[axis]!, 10);
        expect(box.max[axis]).toBeCloseTo(expected[index]!.max[axis]!, 10);
      }
      expect(box.radius).toBeCloseTo(expected[index]!.radius, 10);
    }
  },
);

it('preserves partial cover admission under mouse look within one bisection step', () => {
  const f = fixture('right', 'standing', 1);
  const rest = cornerBoxes(f.input(0), f.side);
  const full = cornerBoxes(f.input(1), f.side);
  const front = Math.floor(Math.min(...rest.slice(1).map((box) => box.min[2])));
  const right = (boxes: LeanBox[]) =>
    Math.max(
      ...boxes
        .slice(1)
        .filter((box) => Math.floor(box.min[2]) <= front && Math.floor(box.max[2]) >= front)
        .map((box) => box.max[0]),
    );
  f.setFeet([1 - (right(rest) + right(full)) / 2, 2, 0]);
  let partial = false;
  for (const [yaw, pitch] of [
    [0, 0],
    [0.03, -0.02],
    [-0.04, 0.01],
  ]) {
    const common = {
      amount: 1,
      rollRadians: leanFrame(1, f.tuning).rollRadians,
      isSolid: (x: number, _y: number, z: number) => x >= 1 && z === front,
      marginBlocks: 0,
    };
    const reference = guardLean({ ...common, boxesAt: (amount) => cornerBoxes(f.input(amount, yaw, pitch), f.side) });
    const actual = guardLean({ ...common, boxesAt: (amount) => playerLeanBoxes(f.input(amount, yaw, pitch)) });
    partial ||= reference > 0 && reference < 1;
    expect(Math.abs(actual - reference)).toBeLessThanOrEqual(2 ** -16);
    expect(right(playerLeanBoxes(f.input(actual, yaw, pitch)))).toBeLessThan(1);
  }
  expect(partial).toBe(true);
});
