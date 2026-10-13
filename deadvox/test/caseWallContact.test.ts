import { describe, expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldSolid } from '../src/core/collision.ts';
import { blockId } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldEjectionPose } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf } from '../src/core/items.ts';
import { bodyOverlapsTerrain, stepBody } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { caseFlightPoint } from '../src/render/caseEffects.ts';
import { chargedRifle } from './rifleFixture.ts';

const { registry } = BUNDLED_CONTENT;
const scale = makeScale(0.5);
const pitch = (-20 * Math.PI) / 180;

const makeWallShot = (yaw: number, wallX: number | undefined, startX: number, side: 'left' | 'right' = 'right') => {
  const world = new World();
  const rock = blockId(registry, 'rock');
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 0, z, rock);
    }
  }
  if (wallX !== undefined) {
    for (let y = 1; y <= 7; y++) {
      for (let z = -5; z <= 5; z++) {
        world.setBlock(wallX, y, z, rock);
      }
    }
  }
  const isSolid = worldSolid(world, registry, new BlockEntities(registry));
  const body = createPlayerBody(scale, startX, 1.01, 0);
  for (let frame = 0; frame < 30; frame++) {
    steer(body, scale, yaw, { forward: 1, right: 0, jump: false, sprint: false, walk: true });
    stepBody(body, 1 / 60, isSolid, physicsFor(scale));
  }
  const pose = (): { feet: Vec3; eye: Vec3; yaw: number; pitch: number; blockSize: number } => ({
    feet: [...body.pos],
    eye: [body.pos[0], body.pos[1] + PLAYER.eye / scale.blockSize, body.pos[2]],
    yaw,
    pitch,
    blockSize: scale.blockSize,
  });
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const effects: FirearmShotEffect[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: scale.blockSize,
    isSolid,
    pose,
    onEjection: (effect) => effects.push(effect),
  });
  const { rifle } = chargedRifle(inventory, queue, mechanics, { side });
  const data = firearmHandlingFor(rifle, registry);
  return { body, data, effects, inventory, isSolid, mechanics, pose, rifle, side };
};

const makeCornerShot = () => {
  const yaw = (-80 * Math.PI) / 180;
  const world = new World();
  const rock = blockId(registry, 'rock');
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 0, z, rock);
    }
  }
  for (let y = 1; y <= 7; y++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(2, y, z, rock);
    }
    for (let x = -5; x <= 2; x++) {
      world.setBlock(x, y, 3, rock);
    }
  }
  const isSolid = worldSolid(world, registry, new BlockEntities(registry));
  const body = createPlayerBody(scale, -3, 1.01, 1);
  for (let frame = 0; frame < 120; frame++) {
    steer(body, scale, yaw, { forward: 1, right: 1, jump: false, sprint: false, walk: true });
    stepBody(body, 1 / 60, isSolid, physicsFor(scale));
  }
  const pose = {
    feet: [...body.pos] as Vec3,
    eye: [body.pos[0], body.pos[1] + PLAYER.eye / scale.blockSize, body.pos[2]] as Vec3,
    yaw,
    pitch,
    blockSize: scale.blockSize,
  };
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const effects: FirearmShotEffect[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: scale.blockSize,
    isSolid,
    pose: () => pose,
    onEjection: (ejection) => effects.push(ejection),
  });
  const { rifle } = chargedRifle(inventory, queue, mechanics);
  const data = firearmHandlingFor(rifle, registry);
  return { body, data, effects, inventory, isSolid, mechanics, pose, rifle };
};

const fireAndCycle = (shot: ReturnType<typeof makeWallShot>, simTime = 1): void => {
  if (
    !shot.mechanics.fire({
      ...shot.pose(),
      aimFrame: NEUTRAL_AIM,
      ready: true,
      sprinting: false,
      item: shot.rifle,
      seed: 71,
      simTime,
    })
  ) {
    throw new Error('Wall-contact rifle did not fire');
  }
  shot.mechanics.advanceTo(simTime + 0.25);
};

describe('firearm case wall contact', () => {
  it('keeps a case when the free port starts on the wall face at zero outward distance', () => {
    const yaw = (3 * Math.PI) / 4;
    const wallX = -3;
    const wall = new World();
    const rock = blockId(registry, 'rock');
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        wall.setBlock(x, 0, z, rock);
      }
    }
    for (let y = 1; y <= 7; y++) {
      for (let z = -5; z <= 5; z++) {
        wall.setBlock(wallX, y, z, rock);
      }
    }
    const isSolid = worldSolid(wall, registry, new BlockEntities(registry));
    const inventory = new Inventory(registry);
    const queue = new HandlingQueue(inventory);
    const effects: FirearmShotEffect[] = [];
    let currentPose = { feet: [0, 1, 0] as Vec3, eye: [0, 4, 0] as Vec3, yaw, pitch, blockSize: scale.blockSize };
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: scale.blockSize,
      isSolid,
      pose: () => currentPose,
      onEjection: (effect) => effects.push(effect),
    });
    const { rifle } = chargedRifle(inventory, queue, mechanics);
    const data = firearmHandlingFor(rifle, registry);
    const portAtEye = (eye: Vec3) =>
      heldEjectionPose({
        model: data.model,
        side: 'right',
        twoHanded: defOf(registry, rifle.type).twoHanded === true,
        eye,
        yaw,
        pitch,
      });
    const {
      origin: [portOffsetX],
    } = portAtEye([0, 0, 0]);
    const faceEyeX = (wallX + 1) * scale.blockSize - portOffsetX;
    const firstStep = (PLAYER.walk / scale.blockSize / 60) * Math.sin(yaw);
    const body = createPlayerBody(scale, faceEyeX / scale.blockSize + firstStep, 1.01, 0);
    steer(body, scale, yaw, { forward: 1, right: 0, jump: false, sprint: false, walk: true });
    stepBody(body, 1 / 60, isSolid, physicsFor(scale));
    for (let frame = 0; frame < 10; frame++) {
      steer(body, scale, yaw, { forward: 0, right: 0, jump: false, sprint: false, walk: true });
      stepBody(body, 1 / 60, isSolid, physicsFor(scale));
    }
    expect(bodyOverlapsTerrain(body, isSolid)).toBe(false);
    expect(body.onGround).toBe(true);
    currentPose = {
      ...currentPose,
      feet: [...body.pos],
      eye: [body.pos[0], body.pos[1] + PLAYER.eye / scale.blockSize, body.pos[2]],
    };
    const port = portAtEye(currentPose.eye.map((value) => value * scale.blockSize) as Vec3);
    const portBlocks = port.origin.map((value) => value / scale.blockSize) as Vec3;
    const [portX, portY, portZ] = portBlocks;
    expect(isSolid(...(portBlocks.map(Math.floor) as Vec3))).toBe(false);
    expect(portX).toBeCloseTo(wallX + 1, 8);
    expect(isSolid(wallX, Math.floor(portY), Math.floor(portZ))).toBe(true);
    if (
      !mechanics.fire({
        ...currentPose,
        aimFrame: NEUTRAL_AIM,
        ready: true,
        sprinting: false,
        item: rifle,
        seed: 71,
        simTime: 1,
      })
    ) {
      throw new Error('Face-contact rifle did not fire');
    }
    mechanics.advanceTo(1.25);
    mechanics.advanceTo(3);
    const cases = [...inventory.piles.values()].filter((pile) =>
      pile.items.some(({ item }) => item.type === spentCaseItemId(data.calibre)),
    );
    expect(effects).toHaveLength(1);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.pos[0]).toBeGreaterThan(wallX);
    expect(isSolid(...cases[0]!.pos)).toBe(false);
    expect(isSolid(cases[0]!.pos[0], cases[0]!.pos[1] - 1, cases[0]!.pos[2])).toBe(true);
  });

  it('keeps an unobstructed ejection at its authored launch direction', () => {
    const yaw = (3 * Math.PI) / 4;
    const shot = makeWallShot(yaw, undefined, 0.5);
    const raw = heldEjectionPose({
      model: shot.data.model,
      side: shot.side,
      twoHanded: defOf(registry, shot.rifle.type).twoHanded === true,
      eye: shot.pose().eye.map((value) => value * scale.blockSize) as Vec3,
      yaw,
      pitch,
    });
    const origin = raw.origin.map((value) => value / scale.blockSize) as Vec3;
    expect(raycast(origin, raw.direction, 8, shot.isSolid)).toBeUndefined();
    fireAndCycle(shot);
    shot.mechanics.advanceTo(3);
    expect(shot.effects).toHaveLength(1);
    expect(shot.effects[0]!.origin).toEqual(raw.origin);
    expect(shot.effects[0]!.direction).toEqual(raw.direction);
  });

  it('keeps a clipped diagonal case arc outside the wall until its supported landing', () => {
    const yaw = (3 * Math.PI) / 4;
    const wallX = -3;
    const shot = makeWallShot(yaw, wallX, -0.9);
    expect(bodyOverlapsTerrain(shot.body, shot.isSolid)).toBe(false);
    expect(shot.body.onGround).toBe(true);
    const raw = heldEjectionPose({
      model: shot.data.model,
      side: shot.side,
      twoHanded: defOf(registry, shot.rifle.type).twoHanded === true,
      eye: shot.pose().eye.map((value) => value * scale.blockSize) as Vec3,
      yaw,
      pitch,
    });
    expect(shot.isSolid(...(raw.origin.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(true);
    fireAndCycle(shot);
    shot.mechanics.advanceTo(3);
    expect(shot.effects).toHaveLength(1);
    const effect = shot.effects[0]!;
    expect(effect.direction).toEqual([0, -1, 0]);
    expect(shot.isSolid(...(effect.origin.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);
    const casePile = [...shot.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === spentCaseItemId(shot.data.calibre)),
    );
    expect(casePile).toBeDefined();
    expect(casePile!.pos[0]).toBeGreaterThan(wallX);
    expect(casePile!.pos).toEqual(effect.landingPosition);
    expect(shot.isSolid(...casePile!.pos)).toBe(false);
    expect(shot.isSolid(casePile!.pos[0], casePile!.pos[1] - 1, casePile!.pos[2])).toBe(true);

    const landing: Vec3 = [
      (effect.landingPosition[0] + 0.5) * scale.blockSize,
      effect.landingPosition[1] * scale.blockSize + 0.006,
      (effect.landingPosition[2] + 0.5) * scale.blockSize,
    ];
    const duration = effect.landingAt - effect.startedAtSimSeconds;
    const initialVelocity: Vec3 = effect.direction.map((value) => value * effect.speed) as Vec3;
    for (let sample = 0; sample <= 64; sample++) {
      const point = caseFlightPoint(effect.origin, landing, sample / 64, {
        durationSimSeconds: duration,
        initialVelocity,
      });
      expect(shot.isSolid(...(point.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);
    }
  });

  it('keeps a clipped case drop outside both walls at a room corner', () => {
    const shot = makeCornerShot();
    expect(bodyOverlapsTerrain(shot.body, shot.isSolid)).toBe(false);
    expect(shot.body.onGround).toBe(true);
    const raw = heldEjectionPose({
      model: shot.data.model,
      side: 'right',
      twoHanded: defOf(registry, shot.rifle.type).twoHanded === true,
      eye: shot.pose.eye.map((value) => value * scale.blockSize) as Vec3,
      yaw: shot.pose.yaw,
      pitch: shot.pose.pitch,
    });
    expect(shot.isSolid(...(raw.origin.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(true);
    if (
      !shot.mechanics.fire({
        ...shot.pose,
        aimFrame: NEUTRAL_AIM,
        ready: true,
        sprinting: false,
        item: shot.rifle,
        seed: 71,
        simTime: 1,
      })
    ) {
      throw new Error('Corner-contact rifle did not fire');
    }
    shot.mechanics.advanceTo(1.25);
    shot.mechanics.advanceTo(3);
    expect(shot.effects).toHaveLength(1);
    const blockedEffect = shot.effects[0]!;
    const casePile = [...shot.inventory.piles.values()].find((pile) =>
      pile.items.some(({ item }) => item.type === spentCaseItemId(shot.data.calibre)),
    );
    expect(casePile).toBeDefined();
    expect(shot.isSolid(...casePile!.pos)).toBe(false);
    expect(shot.isSolid(casePile!.pos[0], casePile!.pos[1] - 1, casePile!.pos[2])).toBe(true);
    const landing: Vec3 = [
      (blockedEffect.landingPosition[0] + 0.5) * scale.blockSize,
      blockedEffect.landingPosition[1] * scale.blockSize + 0.006,
      (blockedEffect.landingPosition[2] + 0.5) * scale.blockSize,
    ];
    const duration = blockedEffect.landingAt - blockedEffect.startedAtSimSeconds;
    const initialVelocity: Vec3 = blockedEffect.direction.map((value) => value * blockedEffect.speed) as Vec3;
    for (let sample = 0; sample <= 64; sample++) {
      const point = caseFlightPoint(blockedEffect.origin, landing, sample / 64, {
        durationSimSeconds: duration,
        initialVelocity,
      });
      expect(shot.isSolid(...(point.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);
    }
  });
});
