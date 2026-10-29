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
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { firearmsCombatTuning } from '../src/core/skillTraining.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { CaseEffects, caseFlightPoint } from '../src/render/caseEffects.ts';
import { createPlayerBody, type MoveIntent, PLAYER, physicsFor, steer, WORLD_GRAVITY } from './playerFixture.ts';
import { chargedRifle } from './rifleFixture.ts';

const { registry } = BUNDLED_CONTENT;
const CASE_LANDING_LIFT = firearmsCombatTuning(registry).caseEjection.landingLiftMetres;
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

type Session = ReturnType<typeof createSession>;
interface CaseObservation {
  readonly point: Vec3;
  readonly solid: boolean;
}

const cornerWorld = (): World => {
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
    for (let x = -5; x <= 5; x++) {
      world.setBlock(x, y, 3, rock);
    }
  }
  return world;
};

const raisedFloorWorld = (): World => {
  const world = new World();
  const rock = blockId(registry, 'rock');
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      world.setBlock(x, 0, z, rock);
    }
    for (let z = -5; z <= 2; z++) {
      world.setBlock(x, 1, z, rock);
    }
  }
  for (let y = 1; y <= 7; y++) {
    for (let x = -5; x <= 5; x++) {
      world.setBlock(x, y, 4, rock);
    }
  }
  return world;
};

const advanceFrames = (session: Session, count: number): void => {
  for (let frame = 0; frame < count; frame++) {
    session.frame(1 / 60);
  }
};

const sessionPose = (session: Session, yaw: number) => ({
  feet: [...session.body.pos] as Vec3,
  eye: [
    session.body.pos[0],
    session.body.pos[1] + session.playerEyeHeightMetres / scale.blockSize,
    session.body.pos[2],
  ] as Vec3,
  yaw,
  pitch,
  blockSize: scale.blockSize,
});

const observeCaseFrames = (
  session: Session,
  renderer: CaseEffects,
  isSolid: ReturnType<typeof worldSolid>,
  count: number,
): CaseObservation[] => {
  const observations: CaseObservation[] = [];
  for (let frame = 0; frame < count; frame++) {
    session.frame(1 / 60);
    renderer.update(session.sim.time);
    for (const visual of renderer.mesh.children.filter((child) => child.visible)) {
      const point = visual.position.toArray() as Vec3;
      const cell = point.map((value) => Math.floor(value / scale.blockSize)) as Vec3;
      observations.push({ point, solid: isSolid(...cell) });
    }
  }
  return observations;
};

interface SessionScene {
  readonly world: World;
  readonly spawn: Vec3;
  readonly intent: MoveIntent;
  readonly crouched?: boolean;
}

const makeCaseSession = ({ world, spawn, intent: startingIntent, crouched = false }: SessionScene) => {
  const entities = new BlockEntities(registry);
  const isSolid = worldSolid(world, registry, entities);
  const renderer = new CaseEffects(scale.blockSize, WORLD_GRAVITY);
  const effects: FirearmShotEffect[] = [];
  const spawnResults: boolean[] = [];
  const yaw = (-80 * Math.PI) / 180;
  let intent = startingIntent;
  let crouchToggle = crouched;
  const session = createSession({
    registry,
    world,
    entities,
    isSolid,
    isOpaque: isSolid,
    scale,
    seed: 73,
    start: 43_200,
    spawn,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      readyHeld: () => true,
      consumeStanceToggle: () => {
        const pressed = crouchToggle;
        crouchToggle = false;
        return pressed ? 'crouch' : undefined;
      },
      yaw: () => yaw,
      pitch: () => pitch,
      walking: () => intent.walk,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    onFirearmEjection: (effect) => {
      effects.push(effect);
      const [x, y, z] = effect.landingPosition;
      const landingPosition: Vec3 = [
        (x + 0.5) * scale.blockSize,
        y * scale.blockSize + CASE_LANDING_LIFT,
        (z + 0.5) * scale.blockSize,
      ];
      spawnResults.push(renderer.spawn({ ...effect, landingPosition }));
    },
  });
  const { rifle } = chargedRifle(session.inventory, session.queue, session.firearms, {
    magazines: session.magazines,
  });
  return {
    effects,
    isSolid,
    renderer,
    spawnResults,
    rifle,
    session,
    yaw,
    setIntent: (next: MoveIntent) => {
      intent = next;
    },
  };
};

const makeCrouchedCornerRuntime = () =>
  makeCaseSession({
    world: cornerWorld(),
    spawn: [0.9, 1.01, 1.9],
    intent: { ...IDLE, forward: 1, right: 1, walk: true },
    crouched: true,
  });

const makeRaisedFloorRuntime = () =>
  makeCaseSession({
    world: raisedFloorWorld(),
    spawn: [1.3999, 2.01, 2.15],
    intent: { ...IDLE, right: 1, walk: true },
  });

const walkToRaisedEdge = (runtime: ReturnType<typeof makeRaisedFloorRuntime>): void => {
  for (let frame = 0; frame < 120; frame++) {
    runtime.session.frame(1 / 60);
    if (runtime.session.body.pos[2] >= 2.4) {
      runtime.setIntent({ ...IDLE });
    }
  }
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
        holds: registry.figures.get('player')!.holds,
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
    body.onGround = true;
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
      holds: registry.figures.get('player')!.holds,
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
    expect(shot.effects[0]!.verticalDrop).toBeUndefined();
  });

  it('keeps a clipped diagonal case arc outside the wall until its supported landing', () => {
    const yaw = (3 * Math.PI) / 4;
    const wallX = -3;
    const shot = makeWallShot(yaw, wallX, -0.9);
    expect(bodyOverlapsTerrain(shot.body, shot.isSolid)).toBe(false);
    expect(shot.body.onGround).toBe(true);
    const raw = heldEjectionPose({
      holds: registry.figures.get('player')!.holds,
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
      effect.landingPosition[1] * scale.blockSize + CASE_LANDING_LIFT,
      (effect.landingPosition[2] + 0.5) * scale.blockSize,
    ];
    const duration = effect.landingAt - effect.startedAtSimSeconds;
    const initialVelocity: Vec3 = effect.direction.map((value) => value * effect.speed) as Vec3;
    for (let sample = 0; sample <= 64; sample++) {
      const point = caseFlightPoint(effect.origin, landing, sample / 64, {
        durationSimSeconds: duration,
        initialVelocity,
        gravityMetresPerSimSecondSquared: WORLD_GRAVITY,
      });
      expect(shot.isSolid(...(point.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);
    }
  });

  it('keeps a clipped case drop outside both walls at a room corner', () => {
    const shot = makeCornerShot();
    expect(bodyOverlapsTerrain(shot.body, shot.isSolid)).toBe(false);
    expect(shot.body.onGround).toBe(true);
    const raw = heldEjectionPose({
      holds: registry.figures.get('player')!.holds,
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
      blockedEffect.landingPosition[1] * scale.blockSize + CASE_LANDING_LIFT,
      (blockedEffect.landingPosition[2] + 0.5) * scale.blockSize,
    ];
    const duration = blockedEffect.landingAt - blockedEffect.startedAtSimSeconds;
    const initialVelocity: Vec3 = blockedEffect.direction.map((value) => value * blockedEffect.speed) as Vec3;
    for (let sample = 0; sample <= 64; sample++) {
      const point = caseFlightPoint(blockedEffect.origin, landing, sample / 64, {
        durationSimSeconds: duration,
        initialVelocity,
        gravityMetresPerSimSecondSquared: WORLD_GRAVITY,
      });
      expect(shot.isSolid(...(point.map((value) => Math.floor(value / scale.blockSize)) as Vec3))).toBe(false);
    }
  });

  it('keeps a crouched corner drop descending to its landing without entering the floor', () => {
    const runtime = makeCrouchedCornerRuntime();
    advanceFrames(runtime.session, 120);
    expect(runtime.session.stance).toBe('crouching');
    expect(runtime.session.body.onGround).toBe(true);
    expect(bodyOverlapsTerrain(runtime.session.body, runtime.isSolid)).toBe(false);
    runtime.setIntent({ ...IDLE });
    const pose = sessionPose(runtime.session, runtime.yaw);
    expect(
      runtime.session.firearms.fire({
        ...pose,
        aimFrame: NEUTRAL_AIM,
        item: runtime.rifle,
        ready: true,
        sprinting: false,
        seed: 71,
        simTime: runtime.session.sim.time,
      }),
    ).toBe(true);

    const observations = observeCaseFrames(runtime.session, runtime.renderer, runtime.isSolid, 60);
    expect(runtime.effects).toHaveLength(1);
    expect(runtime.spawnResults).toEqual([true]);
    expect(observations.length).toBeGreaterThan(0);
    const effect = runtime.effects[0]!;
    const duration = effect.landingAt - effect.startedAtSimSeconds;
    const landingY = effect.landingPosition[1] * scale.blockSize + CASE_LANDING_LIFT;
    expect(observations.filter(({ solid }) => solid)).toEqual([]);
    expect(observations.every(({ point }) => point[1] >= landingY - 1e-6)).toBe(true);
    expect(effect.direction).toEqual([0, -1, 0]);
    expect(effect.verticalDrop).toBe(true);
    expect(effect.speed * duration).toBeCloseTo(effect.origin[1] - landingY);
    expect(observations.every(({ point }) => point[0] === effect.origin[0] && point[2] === effect.origin[2])).toBe(
      true,
    );
    for (let frame = 1; frame < observations.length; frame++) {
      expect(observations[frame]!.point[1]).toBeLessThanOrEqual(observations[frame - 1]!.point[1] + 1e-6);
    }
    runtime.renderer.dispose();
  });

  it('settles a blocked raised-floor ejection under the launch column', () => {
    const runtime = makeRaisedFloorRuntime();
    walkToRaisedEdge(runtime);
    expect(runtime.session.body.onGround).toBe(true);
    expect(bodyOverlapsTerrain(runtime.session.body, runtime.isSolid)).toBe(false);
    runtime.setIntent({ ...IDLE });
    const pose = sessionPose(runtime.session, runtime.yaw);
    expect(
      runtime.session.firearms.fire({
        ...pose,
        aimFrame: NEUTRAL_AIM,
        item: runtime.rifle,
        ready: true,
        sprinting: false,
        seed: 71,
        simTime: runtime.session.sim.time,
      }),
    ).toBe(true);

    const observations = observeCaseFrames(runtime.session, runtime.renderer, runtime.isSolid, 60);
    expect(runtime.effects).toHaveLength(1);
    expect(runtime.spawnResults).toEqual([true]);
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.filter(({ solid }) => solid)).toEqual([]);
    const effect = runtime.effects[0]!;
    expect(effect.verticalDrop).toBe(true);
    const { calibre } = firearmHandlingFor(runtime.rifle, registry);
    const cases = [...runtime.session.inventory.piles.values()].filter((pile) =>
      pile.items.some(({ item }) => item.type === spentCaseItemId(calibre)),
    );
    expect(cases).toHaveLength(1);
    const landing = cases[0]!.pos;
    const launchColumn = effect.origin.map((value) => Math.floor(value / scale.blockSize)) as Vec3;
    expect(landing).toEqual(effect.landingPosition);
    expect(landing[0]).toBe(launchColumn[0]);
    expect(landing[2]).toBe(launchColumn[2]);
    expect(runtime.isSolid(...landing)).toBe(false);
    expect(runtime.isSolid(landing[0], landing[1] - 1, landing[2])).toBe(true);
    runtime.renderer.dispose();
  });
});
