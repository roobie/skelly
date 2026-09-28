import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { type Body, bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { Rng } from '../src/core/random.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import { FISTS_MELEE, hearPlayer, type PlayerSense, perceivePlayer, ZombieSystem } from '../src/core/zombies.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { FIGURE_BOXES, FIGURE_PARTS } from '../src/render/figure.ts';
import { ZombieMeshes } from '../src/render/zombies.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const PHYSICS = physicsFor(SCALE);
const FLOOR: SolidAt = (_x, y) => y === 0;
const player = (
  pos: Vec3,
  facing: Vec3 = [-1, 0, 0],
  movement: PlayerSense['movement'] = 'still',
  lit = false,
): PlayerSense => ({ pos, facing, movement, lit, lightSeenFrom: 40 });
const senses = (
  playerFn: () => PlayerSense,
  isSolid: SolidAt = FLOOR,
  hourFn: () => number = () => 12,
  hurtPlayer: (amount: number) => void = () => undefined,
) => ({
  player: playerFn,
  isSolid,
  hour: hourFn,
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  jumpSpeed: PLAYER.jump,
  hurtPlayer,
});
const run = (system: ZombieSystem, seconds: number, onStep?: () => void) => {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    system.tick(1 / 60);
    onStep?.();
  }
};
const metres = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]) * BLOCK_SIZE;
const boxesOverlap = (a: Body, b: Body): boolean =>
  Math.abs(a.pos[0] - b.pos[0]) < a.halfWidth + b.halfWidth &&
  Math.abs(a.pos[2] - b.pos[2]) < a.halfWidth + b.halfWidth &&
  a.pos[1] < b.pos[1] + b.height &&
  a.pos[1] + a.height > b.pos[1];
const overlapDepthMetres = (a: Body, b: Body): number => {
  if (a.pos[1] >= b.pos[1] + b.height || b.pos[1] >= a.pos[1] + a.height) {
    return 0;
  }
  const overlapX = a.halfWidth + b.halfWidth - Math.abs(a.pos[0] - b.pos[0]);
  const overlapZ = a.halfWidth + b.halfWidth - Math.abs(a.pos[2] - b.pos[2]);
  return Math.max(0, Math.min(overlapX, overlapZ) * BLOCK_SIZE);
};
const bodyHitsSolid = (body: Body, isSolid: SolidAt): boolean => {
  for (let y = Math.floor(body.pos[1]); y < Math.ceil(body.pos[1] + body.height); y++) {
    for (let z = Math.floor(body.pos[2] - body.halfWidth); z < Math.ceil(body.pos[2] + body.halfWidth); z++) {
      for (let x = Math.floor(body.pos[0] - body.halfWidth); x < Math.ceil(body.pos[0] + body.halfWidth); x++) {
        if (isSolid(x, y, z) && bodyOverlapsBlock(body, [x, y, z])) {
          return true;
        }
      }
    }
  }
  return false;
};
const stairTop = (z: number): number => {
  if (z >= 6) {
    return 4;
  }
  if (z >= 5) {
    return 3;
  }
  if (z >= 4) {
    return 2;
  }
  return 1;
};
const terrainUnder = (body: Body): number => {
  let top = 0;
  for (let z = Math.floor(body.pos[2] - body.halfWidth); z <= Math.floor(body.pos[2] + body.halfWidth); z++) {
    for (let x = Math.floor(body.pos[0] - body.halfWidth); x <= Math.floor(body.pos[0] + body.halfWidth); x++) {
      const overlapsColumn =
        body.pos[0] - body.halfWidth < x + 1 &&
        body.pos[0] + body.halfWidth > x &&
        body.pos[2] - body.halfWidth < z + 1 &&
        body.pos[2] + body.halfWidth > z;
      if (overlapsColumn) {
        top = Math.max(top, stairTop(z));
      }
    }
  }
  return top;
};
const bodyTerrainViolations = (body: Body, stairs: SolidAt): string[] => {
  const violations: string[] = [];
  if (bodyHitsSolid(body, stairs)) {
    violations.push(`solid intersection: ${body.pos}`);
  }
  if (body.onGround && Math.abs(body.pos[1] - terrainUnder(body)) > 0.01) {
    violations.push(`feet ${body.pos[1]} != terrain ${terrainUnder(body)} at ${body.pos}`);
  }
  return violations;
};
const stackedBodyViolations = (bodies: readonly Body[]): string[] => {
  const violations: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const overlapsHorizontally =
        Math.abs(a.pos[0] - b.pos[0]) < a.halfWidth + b.halfWidth &&
        Math.abs(a.pos[2] - b.pos[2]) < a.halfWidth + b.halfWidth;
      if (overlapsHorizontally && a.pos[1] > b.pos[1] + b.height + 0.01) {
        violations.push(`body ${i} stacked on ${j}: ${a.pos} / ${b.pos}`);
      }
      if (overlapsHorizontally && b.pos[1] > a.pos[1] + a.height + 0.01) {
        violations.push(`body ${j} stacked on ${i}: ${b.pos} / ${a.pos}`);
      }
    }
  }
  return violations;
};
const terrainBodyViolations = (bodies: readonly Body[], stairs: SolidAt): string[] => [
  ...bodies.flatMap((body) => bodyTerrainViolations(body, stairs)),
  ...stackedBodyViolations(bodies),
];
const runChaserAtWall = (isSolid: SolidAt, seconds: number) => {
  const target = player([12, 1, 0], [-1, 0, 0]);
  const system = new ZombieSystem(senses(() => target, isSolid));
  const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
  const zombie = system.store.get(id)!;
  const states: { mode: string; verticalVelocity: number; onGround: boolean }[] = [];
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
    states.push({ mode: zombie.mode, verticalVelocity: zombie.body.vel[1], onGround: zombie.body.onGround });
  }
  const wallGap = (6 - zombie.body.pos[0] - zombie.body.halfWidth) * BLOCK_SIZE;
  return { states, wallGap };
};
const standing = (position: Vec3, facing: Vec3 = [0, 0, -1]) => {
  const system = new ZombieSystem(senses(() => player([1000, 1, 1000])));
  const id = system.add(SHAMBLER, position, facing);
  const zombie = system.store.get(id)!;
  zombie.body.onGround = true;
  return { system, id, zombie };
};

/** The solid wall is real geometry; the doorway collision comes directly from BlockEntities. */
const makeDoorWorld = () => {
  const entities = new BlockEntities(registry);
  const door = entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || ((x === 3 || x === 6) && z === 0 && y >= 1 && y <= 4) || entities.isSolid(x, y, z);
  return { entities, door, solid };
};

const instanceBox = (mesh: import('three').InstancedMesh, index = 0) => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const center = new Vector3().setFromMatrixPosition(matrix);
  const size = new Vector3(matrix.elements[0]!, matrix.elements[1]!, matrix.elements[2]!);
  // Use transformed corners instead of decomposing a rotated instance matrix.
  const points: Vector3[] = [];
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        points.push(new Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
  return { center, size, points };
};

describe('shambler perception', () => {
  it('uses configured day/night/light/cone/ray bounds and jogging/sprinting hearing bounds', () => {
    // biome-ignore lint/complexity/useMaxParams: compact table-driven test inputs vary independent perception dimensions.
    const sees = (
      at: Vec3,
      hour: number,
      lit = false,
      wall: SolidAt = () => false,
      movement: PlayerSense['movement'] = 'still',
    ) =>
      perceivePlayer({
        zombie: SHAMBLER,
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: player(at, [-1, 0, 0], movement, lit),
        hour,
        blockSize: BLOCK_SIZE,
        isSolid: wall,
      });
    expect(sees([48, 2, 0], 12)).toBe(true);
    expect(sees([52, 2, 0], 12)).toBe(false);
    expect(sees([18, 2, 0], 23)).toBe(true);
    expect(sees([22, 2, 0], 23)).toBe(false);
    expect(sees([78, 2, 0], 23, true)).toBe(true);
    expect(sees([82, 2, 0], 23, true)).toBe(false);
    expect(sees([78, 2, 0], 23, false)).toBe(false);
    const atAngle = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return sees([20 * Math.cos(radians), 2, 20 * Math.sin(radians)], 12);
    };
    expect(atAngle(50)).toBe(true);
    expect(atAngle(70)).toBe(false);
    expect(sees([10, 2, 0], 12, false, (x, y, z) => x === 4 && y === 4 && z === 0)).toBe(false);
    const opaque = (x: number, y: number, _z: number) => x === 4 && y === 4;
    const muffledHearingEdge = (movement: 'jog' | 'sprint') =>
      (SHAMBLER.hearingRange[movement] * SHAMBLER.hearing * SHAMBLER.hearingModel.farMultiplier -
        SHAMBLER.hearingModel.wallRunCostMetres) /
      BLOCK_SIZE;
    expect(sees([10, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') - 1, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') + 1, 2, 0], 12, false, opaque, 'jogging')).toBe(false);
    expect(sees([muffledHearingEdge('sprint') - 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(true);
    expect(sees([muffledHearingEdge('sprint') + 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(false);
    const hears = (at: Vec3, movement: PlayerSense['movement'], wall: SolidAt = () => false) =>
      perceivePlayer({
        zombie: { ...SHAMBLER, sight: 1, nightSight: 1 },
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: player(at, [-1, 0, 0], movement),
        hour: 12,
        blockSize: BLOCK_SIZE,
        isSolid: wall,
      });
    expect(hears([5, 2, 0], 'walking')).toBe(true);
    expect(hears([7, 2, 0], 'walking')).toBe(true);
    const walkingFarEdge =
      (SHAMBLER.hearingRange.walk * SHAMBLER.hearing * SHAMBLER.hearingModel.farMultiplier) / BLOCK_SIZE;
    expect(hears([walkingFarEdge - 1, 2, 0], 'walking')).toBe(true);
    expect(hears([walkingFarEdge + 1, 2, 0], 'walking')).toBe(false);
    expect(hears([5, 2, 0], 'still')).toBe(false);
  });
});

describe('shambler scenarios', () => {
  it('refuses to close a real door on the player or a shambler, then closes with a 1 m clearance', () => {
    const { entities, door } = makeDoorWorld();
    const body = (pos: Vec3) => ({ pos, vel: [0, 0, 0] as Vec3, halfWidth: 0.56, height: 3.4, onGround: true });
    const playerBody = body([5, 1, 0]);
    const safePlayer = body([10, 1, 10]);
    const inDoor = body([5, 1, 0.3]);
    const oneMetreAway = body([5, 1, 3.56]);

    entities.setOpen(door, true);
    expect(entities.closeDoor(door, playerBody, [])).toBe('player');
    expect(door.open).toBe(true);

    expect(entities.closeDoor(door, safePlayer, [inDoor])).toBe('other');
    expect(door.open).toBe(true);

    expect(entities.bodyIntersects(door, oneMetreAway)).toBe(false);
    expect(entities.closeDoor(door, safePlayer, [oneMetreAway])).toBeUndefined();
    expect(door.open).toBe(false);
  });

  it('A: reaches the player through a real open wood_door entity within 20 seconds', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const target = [5, 1, -6] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1]), solid));
    const id = system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]);
    run(system, 20);
    expect(metres(system.store.get(id)!.body.pos, target)).toBeLessThanOrEqual(1.2);
  });

  it('routes three close-spaced shamblers through an open real door with no body jams', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const playerBody = createPlayerBody(SCALE, 5, 1, -6);
    playerBody.onGround = true;
    const target = { ...player([5, 1, -6], [0, 0, 1]), body: playerBody };
    const system = new ZombieSystem(senses(() => target, solid));
    const ids = [
      system.add(SHAMBLER, [5, 1, 4], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 5], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]),
    ];
    for (let tick = 0; tick < 20 * 20; tick++) {
      system.tick(1 / 20);
      for (const id of ids) {
        const zombie = system.store.get(id)!;
        expect(bodyHitsSolid(zombie.body, solid)).toBe(false);
        expect(boxesOverlap(zombie.body, playerBody)).toBe(false);
      }
    }
    expect(
      ids.every((id) => system.store.get(id)!.body.pos[2] < -2),
      ids.map((id) => `${system.store.get(id)!.mode}:${system.store.get(id)!.body.pos}`).join('; '),
    ).toBe(true);
  });

  it('B: hears the sprinting player but cannot enter through the real closed door for 120 seconds', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, false);
    const target = [5, 1, -0.56] as Vec3;
    let damage = 0;
    let firstMinuteDamage: number | undefined;
    let frames = 0;
    const system = new ZombieSystem(
      senses(
        () => player(target, [0, 0, 1], 'sprinting'),
        solid,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]);
    const positions: Vec3[] = [];
    let awareFrames = 0;
    run(system, 120, () => {
      const zombie = system.store.get(id)!;
      positions.push([...zombie.body.pos]);
      expect(entities.bodyIntersects(door, zombie.body)).toBe(false);
      if (zombie.mode === 'chase' || zombie.mode === 'investigate') {
        awareFrames += 1;
      }
      frames += 1;
      if (frames === 60 * 60) {
        firstMinuteDamage = damage;
      }
    });
    expect(awareFrames).toBeGreaterThan(120 * 60 * 0.9);
    expect(firstMinuteDamage).toBe(0);
    expect(damage).toBe(0);
    expect(positions.every((position) => position[2] > 1)).toBe(true);
    entities.setOpen(door, true);
    system.tick(1 / 60);
    expect(damage).toBe(8);
    const end = positions.at(-1)!;
    expect((end[2] - 1) * BLOCK_SIZE).toBeLessThanOrEqual(1.5);
  });

  it('still hits through a real open wood_door with a clear chest ray', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([5, 1, -0.56]),
        solid,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    system.add(SHAMBLER, [5, 1, 1.56], [0, 0, -1]);
    system.tick(1 / 60);
    expect(damage).toBe(8);
  });

  it('C: reaches the last-perceived point, loses sight, then returns within 3 m in 120 seconds', () => {
    let target = player([10, 2, 0], [1, 0, 0]);
    let wallOn = false;
    const wall: SolidAt = (x, y) => FLOOR(x, y, 0) || (wallOn && x === 12 && y >= 1 && y <= 5);
    const system = new ZombieSystem(senses(() => target, wall));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    system.tick(1 / 60);
    expect(system.store.get(id)!.mode).toBe('chase');
    const lastSeen = [...system.store.get(id)!.lastPerceived!] as Vec3;
    target = player([24, 2, 0], [1, 0, 0]);
    wallOn = true;
    let reached = false;
    for (let frame = 0; frame < 60 * 40; frame++) {
      system.tick(1 / 60);
      if (metres(system.store.get(id)!.body.pos, lastSeen) <= 1) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
    run(system, 15);
    expect(system.store.get(id)!.mode).not.toBe('chase');
    const chaser = system.store.get(id)!;
    let closestHome = metres(chaser.body.pos, chaser.home);
    for (let frame = 0; frame < 120 * 60; frame++) {
      system.tick(1 / 60);
      closestHome = Math.min(closestHome, metres(chaser.body.pos, chaser.home));
    }
    expect(closestHome).toBeLessThanOrEqual(3);
    expect(metres(chaser.body.pos, chaser.home)).toBeLessThanOrEqual(12.5);
  });

  it('E: steps a 0.5 m block and jumps a 1 m obstacle using player physics at game scale', () => {
    const target = player([24, 2, 0], [-1, 0, 0]);
    for (const [height, seconds] of [
      [1, 5],
      [2, 5],
    ] as const) {
      const obstacle: SolidAt = (x, y) => y === 0 || (x === 6 && y >= 1 && y <= height);
      const system = new ZombieSystem(senses(() => target, obstacle));
      const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
      run(system, seconds);
      expect(system.store.get(id)!.body.pos[0] * BLOCK_SIZE, `obstacle height ${height}`).toBeGreaterThan(3.25);
    }
  });

  it('does not jump forever at a 2 m wall with a see-through window at eye height', () => {
    const windowWall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && y >= 1 && y <= 4 && y !== 3);
    const result = runChaserAtWall(windowWall, 30);
    expect(result.states.every((state) => state.verticalVelocity <= 0)).toBe(true);
    expect(result.states.every((state) => state.mode === 'chase')).toBe(true);
    expect(result.states.slice(1).every((state) => state.onGround)).toBe(true);
    expect(result.wallGap).toBeGreaterThanOrEqual(-0.001);
    expect(result.wallGap).toBeLessThanOrEqual(1);
  });

  it('does not jump a 1 m wall when a low ceiling leaves too little headroom', () => {
    const lowCeiling: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && (y === 1 || y === 2 || y === 5));
    const result = runChaserAtWall(lowCeiling, 5);
    expect(result.states.every((state) => state.verticalVelocity <= 0)).toBe(true);
    expect(result.states.every((state) => state.mode === 'chase')).toBe(true);
    expect(result.states.slice(1).every((state) => state.onGround)).toBe(true);
    expect(result.wallGap).toBeGreaterThanOrEqual(-0.001);
    expect(result.wallGap).toBeLessThanOrEqual(1);
  });

  it('stops a walking player at a standing shambler without stepping onto its body', () => {
    const { zombie } = standing([2, 1, 0]);
    zombie.body.onGround = true;
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    playerBody.onGround = true;
    const obstacles = [zombie.body];
    for (let frame = 0; frame < 3 * 60; frame++) {
      steer(playerBody, SCALE, 0, {
        forward: 0,
        right: 1,
        jump: false,
        sprint: false,
        walk: false,
      });
      stepBody(playerBody, 1 / 60, FLOOR, { ...PHYSICS, obstacles });
      expect(boxesOverlap(playerBody, zombie.body)).toBe(false);
    }
    const gap = (zombie.body.pos[0] - zombie.body.halfWidth - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(gap).toBeGreaterThanOrEqual(-0.001);
    expect(gap).toBeLessThanOrEqual(0.05);
    expect(playerBody.pos[1]).toBeCloseTo(1, 3);
  });

  it('does not separate a player standing two metres above a shambler footprint', () => {
    const platform: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 0 && y === 4 && z === 0);
    const playerBody = createPlayerBody(SCALE, 0.5, 5, 0.5);
    playerBody.onGround = true;
    const target = () => ({ ...player(playerBody.pos), body: playerBody });
    const stillShambler = { ...SHAMBLER, speed: { wander: 0, chase: 0 } };
    const system = new ZombieSystem(senses(target, platform));
    const id = system.add(stillShambler, [0.5, 1, 0.5]);
    system.store.get(id)!.body.onGround = true;
    const start = [...playerBody.pos] as Vec3;

    for (let tick = 0; tick < 60; tick++) {
      system.tick(1 / 20);
    }

    expect(playerBody.pos[0]).toBeCloseTo(start[0], 6);
    expect(playerBody.pos[2]).toBeCloseTo(start[2], 6);
  });

  it('does not separate overlapping shambler footprints when one stands two metres above the other', () => {
    const ledge: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 0 && y === 4 && z === 0);
    const stillShambler = { ...SHAMBLER, speed: { wander: 0, chase: 0 } };
    const system = new ZombieSystem(senses(() => player([100, 1, 100]), ledge));
    const lowerId = system.add(stillShambler, [0.5, 1, 0.5]);
    const upperId = system.add(stillShambler, [0.5, 5, 0.5]);
    const lower = system.store.get(lowerId)!.body;
    const upper = system.store.get(upperId)!.body;
    lower.onGround = true;
    upper.onGround = true;
    const lowerStart = [...lower.pos] as Vec3;
    const upperStart = [...upper.pos] as Vec3;

    for (let tick = 0; tick < 60; tick++) {
      system.tick(1 / 20);
    }

    expect(lower.pos[0]).toBeCloseTo(lowerStart[0], 6);
    expect(lower.pos[2]).toBeCloseTo(lowerStart[2], 6);
    expect(upper.pos[0]).toBeCloseTo(upperStart[0], 6);
    expect(upper.pos[2]).toBeCloseTo(upperStart[2], 6);
  });

  it('resolves an existing player/shambler overlap softly beside a wall', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 5 && z === 0 && y >= 1 && y <= 5);
    const playerBody = createPlayerBody(SCALE, 4, 5, 0);
    const target = () => ({ ...player(playerBody.pos, [1, 0, 0]), body: playerBody });
    const system = new ZombieSystem(senses(target, wall));
    const stillShambler = { ...SHAMBLER, speed: { wander: 0, chase: 0 } };
    const id = system.add(stillShambler, [3.4, 1, 0]);
    const zombieBody = system.store.get(id)!.body;
    zombieBody.onGround = true;
    for (let frame = 0; frame < 120; frame++) {
      stepBody(playerBody, 1 / 60, wall, { ...PHYSICS, obstacles: [zombieBody] });
    }
    expect(playerBody.onGround).toBe(true);
    expect(boxesOverlap(playerBody, zombieBody)).toBe(true);
    const wallGap = (5 - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(wallGap).toBeGreaterThanOrEqual(0);
    expect(wallGap).toBeLessThanOrEqual(0.3);

    const dt = 1 / 20;
    const walk = (right: -1 | 1) => {
      for (let tick = 0; tick < 3 * 20; tick++) {
        const playerBefore = [...playerBody.pos] as Vec3;
        const zombieBefore = [...zombieBody.pos] as Vec3;
        system.tick(dt);
        steer(playerBody, SCALE, 0, {
          forward: 0,
          right,
          jump: false,
          sprint: false,
          walk: true,
        });
        stepBody(playerBody, dt, wall, { ...PHYSICS, obstacles: [zombieBody] });
        expect(bodyHitsSolid(playerBody, wall)).toBe(false);
        expect(bodyHitsSolid(zombieBody, wall)).toBe(false);
        expect(metres(playerBefore, playerBody.pos)).toBeLessThanOrEqual(PLAYER.walk * dt + dt + 0.001);
        expect(metres(zombieBefore, zombieBody.pos)).toBeLessThanOrEqual(dt + 0.001);
        if (right === 1 && tick >= 2 * 20) {
          expect(boxesOverlap(playerBody, zombieBody)).toBe(false);
        }
      }
    };
    walk(1);
    walk(-1);
  });

  it('lets a chaser attack a player against a wall without overlapping either box', () => {
    const playerBody = createPlayerBody(SCALE, 0.4, 1, 0);
    playerBody.onGround = true;
    const target = { ...player([0.4, 1, 0]), body: playerBody };
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 5);
    expect(bodyHitsSolid(playerBody, wall)).toBe(false);
    let hits = 0;
    const system = new ZombieSystem(
      senses(
        () => target,
        wall,
        () => 12,
        () => {
          hits += 1;
        },
      ),
    );
    const id = system.add(SHAMBLER, [-5, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    run(system, 3, () => expect(boxesOverlap(playerBody, zombie.body)).toBe(false));
    expect(zombie.mode).toBe('chase');
    expect(hits).toBeGreaterThan(0);
  });

  it('separates five shamblers converging for 10 s without terrain intersections', () => {
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    const target = { ...player([0, 1, 0]), body: playerBody };
    const system = new ZombieSystem(senses(() => target));
    const starts: Vec3[] = [
      [4, 1, 0],
      [6, 1, 0],
      [8, 1, 0],
      [10, 1, 0],
      [12, 1, 0],
    ];
    for (const start of starts) {
      system.add(SHAMBLER, start, [-1, 0, 0]);
    }
    for (let tick = 0; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
      for (const [, zombie] of system.store.entries()) {
        expect(bodyHitsSolid(zombie.body, FLOOR)).toBe(false);
        expect(boxesOverlap(playerBody, zombie.body), `${tick} ${zombie.body.pos}`).toBe(false);
      }
    }
    const finalBodies = [...system.store.entries()].map(([, zombie]) => zombie.body);
    for (let i = 0; i < finalBodies.length; i++) {
      for (let j = i + 1; j < finalBodies.length; j++) {
        expect(
          overlapDepthMetres(finalBodies[i]!, finalBodies[j]!),
          `${i}/${j}: ${finalBodies[i]!.pos} vs ${finalBodies[j]!.pos}`,
        ).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('keeps four chasing shamblers grounded on terrain rather than stacking down three steps', () => {
    const stairs: SolidAt = (_x, y, z) => y < stairTop(z);
    const target = [0.25, 1, 0] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1], 'sprinting'), stairs));
    const ids = [
      system.add(SHAMBLER, [-Math.SQRT1_2, 4, 8 - Math.SQRT1_2]),
      system.add(SHAMBLER, [Math.SQRT1_2, 4, 8 - Math.SQRT1_2]),
      system.add(SHAMBLER, [-Math.SQRT1_2, 4, 8 + Math.SQRT1_2]),
      system.add(SHAMBLER, [Math.SQRT1_2, 4, 8 + Math.SQRT1_2]),
    ];
    const bodies = ids.map((id) => system.store.get(id)!.body);
    for (let tick = 0; tick < 20 * 20; tick++) {
      system.tick(1 / 20);
      for (const id of ids) {
        expect(['chase', 'investigate', 'search', 'return']).toContain(system.store.get(id)!.mode);
      }
      expect(terrainBodyViolations(bodies, stairs), `tick ${tick}`).toEqual([]);
    }
    expect(ids.every((id) => system.store.get(id)!.body.pos[2] < 4)).toBe(true);
  });

  it('pushes two overlapping shamblers apart in a one-metre corridor without wall intersections', () => {
    const corridor: SolidAt = (x, y, z) => FLOOR(x, y, z) || (y >= 1 && (x === 0 || x === 3));
    const stillShambler = { ...SHAMBLER, speed: { wander: 0, chase: 0 } };
    const system = new ZombieSystem(senses(() => player([1000, 1, 1000]), corridor));
    const first = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    const second = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    system.tick(1 / 20);
    expect(Math.abs(first.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    expect(Math.abs(second.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    for (let tick = 1; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
      for (const [, zombie] of system.store.entries()) {
        expect(bodyHitsSolid(zombie.body, corridor)).toBe(false);
      }
    }
    expect(first.body.pos[0]).toBeLessThan(2);
    expect(second.body.pos[0]).toBeGreaterThan(2);
  });

  it('F: melee hits obey cooldown, exact damage and range; fists and real crowbar data kill shamblers', () => {
    let elapsed = 0;
    const hitTimes: number[] = [];
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (damage) => {
          expect(damage).toBe(8);
          hitTimes.push(elapsed);
        },
      ),
    );
    system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    for (let frame = 0; frame < 600; frame++) {
      system.tick(1 / 60);
      elapsed += 1 / 60;
    }
    expect(hitTimes.length).toBeLessThanOrEqual(7);
    expect(hitTimes.length).toBeGreaterThan(0);
    expect(hitTimes.every((time, index) => index === 0 || time - hitTimes[index - 1]! >= 1.5)).toBe(true);

    let outsideDamage = 0;
    const stillTarget = player([0, 2, 0]);
    const noChase = { ...SHAMBLER, speed: { ...SHAMBLER.speed, chase: 0 } };
    const outside = new ZombieSystem(
      senses(
        () => stillTarget,
        FLOOR,
        () => 12,
        (damage) => {
          outsideDamage += damage;
        },
      ),
    );
    outside.add(noChase, [2.6, 1, 0], [-1, 0, 0]);
    run(outside, 10);
    expect(outsideDamage).toBe(0);

    const stationary = { ...SHAMBLER, speed: { wander: 0, chase: 0 } };
    const fistSystem = new ZombieSystem(senses(() => player([100, 2, 0])));
    const fistId = fistSystem.add(stationary, [0.5, 1, 0]);
    let deathDrops = 0;
    // Recreate with a death callback to assert the production drop hook runs.

    const fists = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onDeath: () => {
        deathDrops += 1;
      },
    });
    const fistsId = fists.add(stationary, [0.5, 1, 0]);
    for (let swing = 0; swing < 8; swing++) {
      const target = fists.store.get(fistsId)!;
      const origin: Vec3 = [0, target.body.pos[1] + target.body.height * 0.55, 0];
      expect(fists.swing(origin, [1, 0, 0], FISTS_MELEE)).toBe(fistsId);
      run(fists, FISTS_MELEE.cooldown);
    }
    expect(fists.store.get(fistsId)).toBeUndefined();
    expect(deathDrops).toBe(1);
    expect(fistSystem.swing([0, 2, 0], [1, 0, 0], FISTS_MELEE)).toBe(fistId);

    const crowbar = registry.items.get('crowbar')!.weapon!.melee!;
    const armed = new ZombieSystem(senses(() => player([100, 2, 0])));
    const armedId = armed.add(stationary, [1, 1, 0]);
    let swings = 0;
    while (armed.store.get(armedId)) {
      const target = armed.store.get(armedId)!;
      const origin: Vec3 = [0, target.body.pos[1] + target.body.height * 0.55, 0];
      expect(armed.swing(origin, [1, 0, 0], crowbar)).toBe(armedId);
      run(armed, crowbar.cooldown);
      swings += 1;
    }
    expect(swings).toBe(5);
    expect(
      ['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe'].every(
        (item) => registry.items.get(item)?.weapon?.melee,
      ),
    ).toBe(true);
  });

  it('god mode blocks shambler damage without stopping attacks or their cooldown', () => {
    const simulateAttacks = (godMode: boolean) => {
      const sim = new Simulation({ seed: 9 });
      sim.godMode = godMode;
      let hits = 0;
      const system = new ZombieSystem(
        senses(
          () => player([0, 2, 0]),
          FLOOR,
          () => 12,
          (damage) => {
            hits += 1;
            sim.hurt(damage, 'a shambler');
          },
        ),
      );
      system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
      for (let frame = 0; frame < 60 * 60; frame++) {
        system.tick(1 / 60);
        sim.frame(1 / 60);
      }
      return { health: sim.needs.health, hits };
    };
    const protectedRun = simulateAttacks(true);
    const ordinaryRun = simulateAttacks(false);
    expect(protectedRun.health).toBe(100);
    expect(protectedRun.hits).toBeGreaterThan(0);
    expect(protectedRun.hits).toBe(ordinaryRun.hits);
    expect(ordinaryRun.health).toBeLessThan(100);
  });

  it('G: a hamlet shambler killed by swings stays gone when its column reloads and through 48 game hours', () => {
    const site = new Hamlet(7, registry, SCALE);
    let column: [number, number] | undefined;
    for (let cz = -20; cz <= 20 && !column; cz++) {
      for (let cx = -20; cx <= 20 && !column; cx++) {
        if (site.zombiesIn(cx, cz).length > 0) {
          column = [cx, cz];
        }
      }
    }
    expect(column).toBeDefined();
    const spawner = new ZombieSpawner();
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    const initial = [...system.store.entries()];
    expect(initial.length).toBeGreaterThan(0);
    const [id, zombie] = initial[0]!;
    while (system.store.get(id)) {
      const origin: Vec3 = [
        zombie.body.pos[0],
        zombie.body.pos[1] + zombie.body.height * 0.55 + 0.1,
        zombie.body.pos[2],
      ];
      expect(system.swing(origin, [0, -1, 0], FISTS_MELEE)).toBe(id);
      run(system, FISTS_MELEE.cooldown);
    }
    const survivors = system.store.size;
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    expect(system.store.size).toBe(survivors);
    for (let tick = 0; tick < 720; tick++) {
      system.tick(30);
    }
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    expect(system.store.get(id)).toBeUndefined();
    expect(system.store.size).toBe(survivors);
  });

  it('gait phase tracks travelled distance at wander and chase speeds and stops at a wall', () => {
    const slow = { ...SHAMBLER, speed: { ...SHAMBLER.speed, wander: 0.8 } };
    const wander = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const wanderId = wander.add(slow, [0, 1, 0]);
    const wanderer = wander.store.get(wanderId)!;
    let wandered = 0;
    for (let tick = 0; tick < 10 * 60; tick++) {
      const before = [...wanderer.body.pos] as Vec3;
      wander.tick(1 / 60);
      wandered += metres(before, wanderer.body.pos);
    }
    expect(wandered).toBeGreaterThan(0);
    expect(wanderer.gaitPhase).toBeCloseTo((wandered / slow.stepLength) * Math.PI, 6);

    let target: Vec3 = [20, 1, 0];
    const chase = new ZombieSystem(senses(() => player(target, [-1, 0, 0])));
    const chaseId = chase.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const chaser = chase.store.get(chaseId)!;
    let chasedDistance = 0;
    for (let frame = 0; frame < 600; frame++) {
      target = [target[0] + 2.8 / 60 / BLOCK_SIZE, target[1], target[2]];
      const before = [...chaser.body.pos] as Vec3;
      chase.tick(1 / 60);
      chasedDistance += metres(before, chaser.body.pos);
    }
    expect(chasedDistance).toBeGreaterThan(10);
    expect(chaser.gaitPhase).toBeCloseTo((chasedDistance / chaser.type.stepLength) * Math.PI, 6);

    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 10);
    const blocked = new ZombieSystem(senses(() => player([10, 1, 0], [-1, 0, 0], 'sprinting'), wall));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const blockedZombie = blocked.store.get(blockedId)!;
    run(blocked, 2);
    expect(blockedZombie.mode).toBe('investigate');
    expect(blockedZombie.body.pos[0]).toBeLessThan(1);
    const stuckAt = [...blockedZombie.body.pos] as Vec3;
    const phaseAtWall = blockedZombie.gaitPhase;
    run(blocked, 10);
    expect(metres(blockedZombie.body.pos, stuckAt)).toBe(0);
    expect(blockedZombie.gaitPhase).toBe(phaseAtWall);
  });

  it('H: ten active shamblers update below the 1 ms/60 Hz CPU budget on average', () => {
    const system = new ZombieSystem(senses(() => player([0, 2, 0])));
    for (let i = 0; i < 10; i++) {
      system.add(SHAMBLER, [20 + i, 1, i * 0.5], [-1, 0, 0]);
    }
    const start = process.cpuUsage();
    for (let frame = 0; frame < 600; frame++) {
      system.tick(1 / 60);
    }
    const used = process.cpuUsage(start);
    expect((used.user + used.system) / 1000 / 600).toBeLessThan(1);
  });

  it('keeps the shared figure layout and shambler parts unchanged', () => {
    expect(FIGURE_PARTS).toEqual(['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
    expect(FIGURE_BOXES).toEqual({
      body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
      head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
      leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
      rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
      leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
      rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
    });

    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    expect(parts).toHaveLength(6);
    expect(parts.map((mesh) => (mesh.material as MeshLambertMaterial).color.getHex())).toEqual([
      0x87_96_78, 0x87_96_78, 0x68_6f_5e, 0x68_6f_5e, 0x68_6f_5e, 0x68_6f_5e,
    ]);
    for (const mesh of parts) {
      expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
      expect((mesh.material as MeshLambertMaterial).emissive.getHex()).toBe(0);
    }
  });

  it('smooths a shambler stepping up while keeping its physics and horizontal render position exact', () => {
    const stepWorld: SolidAt = (x, y) => y === 0 || (x === 2 && y === 1);
    const { system, zombie } = standing([1.4, 1, 0], [1, 0, 0]);
    zombie.body.vel[0] = 2.8 / BLOCK_SIZE;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const legs = [parts[4]!, parts[5]!];
    const feet = () => {
      const boxes = legs.map((leg) => instanceBox(leg));
      return {
        y: Math.min(...boxes.flatMap(({ points }) => points.map(({ y }) => y))),
        x: boxes.reduce((sum, { center }) => sum + center.x, 0) / boxes.length,
      };
    };
    const syncFrame = (dt: number) => {
      meshes.sync(system.store, dt);
      const drawn = feet();
      expect(drawn.x).toBeCloseTo(zombie.body.pos[0] * BLOCK_SIZE, 5);
      return drawn.y;
    };

    const beforeStep = syncFrame(0);
    stepBody(zombie.body, 1 / 20, stepWorld, PHYSICS);
    expect(zombie.body.pos[1]).toBeCloseTo(2, 3);
    expect(zombie.body.onGround).toBe(true);
    let previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeStep)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(zombie.body.pos[1] * BLOCK_SIZE, 5);

    const beforeSnapDown = previousDrawnY;
    zombie.body.pos[1] -= 1;
    previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeSnapDown)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(zombie.body.pos[1] * BLOCK_SIZE, 5);
  });

  it('renders collision-sized figures at game scale and swings each leg forward/back about its hip', () => {
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const { system, id, zombie } = standing([4, 1, 4], [1, 0, 0]);
    meshes.sync(system.store);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const boxes = parts.flatMap((mesh) => instanceBox(mesh));
    const points = boxes.flatMap(({ points: corners }) => corners);
    const minY = Math.min(...points.map(({ y }) => y));
    const maxY = Math.max(...points.map(({ y }) => y));
    const widthX = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
    const widthZ = Math.max(...points.map(({ z }) => z)) - Math.min(...points.map(({ z }) => z));
    expect(Math.abs(minY - zombie.body.pos[1] * BLOCK_SIZE)).toBeLessThanOrEqual(0.05);
    expect(maxY - minY).toBeCloseTo(1.7, 1);
    expect(Math.max(widthX, widthZ)).toBeCloseTo(0.6, 1);
    expect(zombie.body.height * BLOCK_SIZE).toBeCloseTo(1.7);
    expect(zombie.body.halfWidth * 2 * BLOCK_SIZE).toBeCloseTo(0.56);

    const legs = [parts[4]!, parts[5]!];
    const feetAtFrame = (frame: number) => {
      zombie.body.vel[0] = 1.6;
      zombie.gaitPhase = frame === 0 ? 0 : 0.12;
      meshes.sync(system.store);
      return legs.map((leg) => {
        const matrix = new Matrix4();
        leg.getMatrixAt(0, matrix);
        const foot = new Vector3(0, -0.5, 0).applyMatrix4(matrix);
        const hip = new Vector3(0, 0.5, 0).applyMatrix4(matrix);
        return { foot, hip };
      });
    };
    const frame0 = feetAtFrame(0);
    const frame1 = feetAtFrame(1);
    for (let leg = 0; leg < 2; leg++) {
      expect(Math.abs(frame0[leg]!.foot.x - frame1[leg]!.foot.x)).toBeGreaterThan(0.01);
      expect(frame0[leg]!.foot.x).not.toBe(frame1[leg]!.foot.x);
      expect(Math.abs(frame0[leg]!.foot.z - frame1[leg]!.foot.z)).toBeLessThan(0.01);
      expect(frame0[leg]!.hip.distanceTo(frame1[leg]!.hip)).toBeLessThan(0.01);
    }
    const upDirectionsAtPhase = (phase: number) => {
      zombie.body.vel[0] = 1.6;
      zombie.gaitPhase = phase;
      meshes.sync(system.store);
      return legs.map((leg) => {
        const matrix = new Matrix4();
        leg.getMatrixAt(0, matrix);
        return new Vector3(0, 1, 0).transformDirection(matrix);
      });
    };
    const walkingPhaseStep = (Math.PI * 0.8) / (SHAMBLER.stepLength * 60);
    const previousUp = upDirectionsAtPhase(0);
    const nextUp = upDirectionsAtPhase(walkingPhaseStep);
    for (let leg = 0; leg < 2; leg++) {
      const angle = Math.acos(Math.max(-1, Math.min(1, previousUp[leg]!.dot(nextUp[leg]!))));
      expect(angle).toBeLessThanOrEqual(0.05);
    }
    zombie.body.vel[0] = 0;
    zombie.gaitPhase = Math.PI / 2;
    meshes.sync(system.store);
    for (const leg of legs) {
      const matrix = new Matrix4();
      leg.getMatrixAt(0, matrix);
      const up = new Vector3(0, 1, 0).transformDirection(matrix);
      expect(up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(0.001);
    }
    expect(system.store.get(id)).toBeDefined();
  });
});

describe('lurching chase', () => {
  it('eases each stumble into and out of a near-stop for at least 0.2 s', () => {
    const type = {
      ...SHAMBLER,
      sight: 1000,
      chaseMotion: { ...SHAMBLER.chaseMotion, stumbleChancePerSecond: 1 },
    };
    const system = new ZombieSystem({ ...senses(() => player([2000, 1, 0])), seed: 19 });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const factors: number[] = [];
    for (let tick = 0; tick < 60 * 20; tick++) {
      system.tick(1 / 20);
      factors.push(zombie.stumbleFactor);
    }
    const bottom = factors.findIndex((factor) => factor <= type.chaseMotion.stumbleSpeedFraction + 0.01);
    expect(bottom).toBeGreaterThan(0);
    let easedInAt = bottom;
    while (easedInAt > 0 && factors[easedInAt - 1]! < 0.999) {
      easedInAt -= 1;
    }
    let plateauEnd = bottom;
    while (
      plateauEnd + 1 < factors.length &&
      factors[plateauEnd + 1]! <= type.chaseMotion.stumbleSpeedFraction + 0.01
    ) {
      plateauEnd += 1;
    }
    let easedOutAt = plateauEnd + 1;
    while (easedOutAt < factors.length && factors[easedOutAt]! < 0.999) {
      easedOutAt += 1;
    }
    expect((bottom - easedInAt + 1) / 20).toBeGreaterThanOrEqual(0.2);
    expect((easedOutAt - plateauEnd) / 20).toBeGreaterThanOrEqual(0.2);
  });

  it('wobbles laterally, lurches speed, and still reaches melee on open ground', () => {
    const target: Vec3 = [30, 1, 0];
    const system = new ZombieSystem({ ...senses(() => player(target)), seed: 91 });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const lateral: number[] = [];
    const speeds: number[] = [];
    let ticks = 0;
    for (; ticks < 20 * 15; ticks++) {
      const before = [...zombie.body.pos] as Vec3;
      system.tick(1 / 20);
      lateral.push(zombie.body.pos[2] * BLOCK_SIZE);
      const speed = metres(before, zombie.body.pos) * 20;
      if (ticks >= 20 && metres(zombie.body.pos, target) > 4) {
        speeds.push(speed);
      }
      if (metres(zombie.body.pos, target) <= SHAMBLER.attack.reach) {
        break;
      }
    }
    const rms = Math.sqrt(lateral.reduce((sum, value) => sum + value * value, 0) / lateral.length);
    let largestOneSecondRange = 0;
    for (let start = 0; start + 20 <= speeds.length; start++) {
      const window = speeds.slice(start, start + 20);
      largestOneSecondRange = Math.max(largestOneSecondRange, Math.max(...window) - Math.min(...window));
    }
    expect(rms).toBeGreaterThanOrEqual(0.3);
    expect(rms).toBeLessThanOrEqual(1.5);
    expect(largestOneSecondRange).toBeGreaterThanOrEqual(0.3 * SHAMBLER.speed.chase);
    const beelineSeconds =
      (15 - SHAMBLER.attack.reach - SHAMBLER.speed.chase ** 2 / (2 * SHAMBLER.wander.movementAcceleration)) /
        SHAMBLER.speed.chase +
      SHAMBLER.speed.chase / SHAMBLER.wander.movementAcceleration;
    expect(ticks / 20).toBeLessThanOrEqual(beelineSeconds * 1.6);
  });
});

describe('facing-directed movement', () => {
  type TravelMode = 'stroll' | 'investigate' | 'return' | 'chase';
  const createScenario = (mode: TravelMode) => {
    let sensed = player(mode === 'chase' ? [10, 1, 0] : [1000, 1, 1000]);
    const type = { ...SHAMBLER, sight: 100, nightSight: 100, sightCone: 180 };
    const system = new ZombieSystem(senses(() => sensed));
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    switch (mode) {
      case 'stroll':
        zombie.mode = 'stroll';
        zombie.modeTimer = 10;
        zombie.strollHeading = [0, 0, 1];
        break;
      case 'investigate':
        zombie.mode = 'investigate';
        zombie.investigationTier = 'near';
        zombie.lastPerceived = [10, 1, 0];
        break;
      case 'return':
        zombie.body.pos = [10, 1, 0];
        zombie.mode = 'return';
        break;
      default:
        break;
    }
    return {
      system,
      zombie,
      reverseTarget: () => {
        sensed = player([-10, 1, 0]);
      },
    };
  };
  const velocityFacingErrorDegrees = (zombie: ReturnType<ZombieSystem['store']['get']>): number | undefined => {
    if (!zombie || Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) < 0.01) {
      return undefined;
    }
    const velocityYaw = Math.atan2(zombie.body.vel[0], zombie.body.vel[2]);
    const facingYaw = Math.atan2(zombie.facing[0], zombie.facing[2]);
    const error = Math.abs(Math.atan2(Math.sin(velocityYaw - facingYaw), Math.cos(velocityYaw - facingYaw)));
    return (error * 180) / Math.PI;
  };
  const exercise = (mode: TravelMode): { observed: Set<string>; errors: number[] } => {
    const { system, zombie, reverseTarget } = createScenario(mode);
    const observed = new Set<string>();
    const errors: number[] = [];
    for (let tick = 0; tick < 80; tick++) {
      if (mode === 'chase' && tick === 20) {
        reverseTarget();
      }
      system.tick(1 / 20);
      observed.add(zombie.mode);
      const error = velocityFacingErrorDegrees(zombie);
      if (error !== undefined) {
        errors.push(error);
      }
    }
    return { observed, errors };
  };

  it('keeps velocity within two degrees of facing through a sharp chase reversal and every travel mode', () => {
    for (const mode of ['stroll', 'investigate', 'return', 'chase'] as const) {
      const result = exercise(mode);
      expect(result.observed.has(mode)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(Math.max(...result.errors)).toBeLessThanOrEqual(2);
    }
    expect(exercise('investigate').observed.has('search')).toBe(true);
  });
});

describe('two-tier shambler hearing', () => {
  const hearing = (seed: number, from: Vec3, source: PlayerSense, isSolid: SolidAt = () => false) =>
    hearPlayer({
      zombie: SHAMBLER,
      from,
      player: source,
      blockSize: BLOCK_SIZE,
      isSolid,
      rng: Rng.stream(seed, 'hearing-test'),
    });

  it('reports the exact near source and bounded, approximate far bearings over fifty seeds', () => {
    const from: Vec3 = [0, 1, 0];
    expect(SHAMBLER.hearingModel.farMultiplier).toBe(2);
    const near = hearing(1, from, player([20, 1, 0], [-1, 0, 0], 'sprinting'));
    expect(near?.tier).toBe('near');
    expect(near?.target).toEqual([20, 1, 0]);
    for (let seed = 0; seed < 50; seed++) {
      const source = player([35, 1, 0], [-1, 0, 0], 'sprinting');
      const far = hearing(seed, from, source);
      expect(far?.tier).toBe('far');
      expect(far?.target).not.toEqual(source.pos);
      expect(metres(far!.target, from)).toBeCloseTo(8, 5);
      const actualBearing = Math.atan2(source.pos[0] - from[0], source.pos[2] - from[2]);
      const guessedBearing = Math.atan2(far!.target[0] - from[0], far!.target[2] - from[2]);
      const error = Math.abs(
        Math.atan2(Math.sin(guessedBearing - actualBearing), Math.cos(guessedBearing - actualBearing)),
      );
      expect(error).toBeLessThanOrEqual(SHAMBLER.hearingModel.bearingErrorRadians);
    }
    const sprintRange = SHAMBLER.hearingRange.sprint * SHAMBLER.hearing;
    const withinFarLimit = hearing(
      51,
      from,
      player([(sprintRange * (SHAMBLER.hearingModel.farMultiplier - 0.1)) / BLOCK_SIZE, 1, 0], [-1, 0, 0], 'sprinting'),
    );
    const outsideFarLimit = hearing(
      52,
      from,
      player([(sprintRange * (SHAMBLER.hearingModel.farMultiplier + 0.1)) / BLOCK_SIZE, 1, 0], [-1, 0, 0], 'sprinting'),
    );
    expect(withinFarLimit?.tier).toBe('far');
    expect(outsideFarLimit).toBeUndefined();
  });

  it('counts each solid run once and lets a wall demote a near noise to far', () => {
    const from: Vec3 = [0, 1, 0];
    const source = player([28, 1, 0], [-1, 0, 0], 'sprinting');
    const clear = hearing(4, from, source);
    const wall: SolidAt = (x, y) => y === 0 || (x >= 12 && x <= 15 && y >= 1 && y <= 5);
    const muffled = hearing(4, from, source, wall);
    expect(clear?.tier).toBe('near');
    expect(muffled?.tier).toBe('far');
    expect(muffled?.target).not.toEqual(source.pos);
  });

  it('investigates near noises exactly but lets far rumours affect only idle or strolling bodies', () => {
    const nearPlayer = player([20, 1, 0], [-1, 0, 0], 'sprinting');
    const nearSystem = new ZombieSystem({ ...senses(() => nearPlayer), seed: 17 });
    const nearId = nearSystem.add({ ...SHAMBLER, sight: 1, nightSight: 1 }, [0, 1, 0]);
    nearSystem.tick(1 / 20);
    const nearZombie = nearSystem.store.get(nearId)!;
    expect(nearZombie.mode).toBe('investigate');
    expect(nearZombie.investigationTier).toBe('near');
    expect(nearZombie.lastPerceived).toEqual(nearPlayer.pos);

    const distant = player([35, 1, 0], [-1, 0, 0], 'sprinting');
    const farSystem = new ZombieSystem({ ...senses(() => distant), seed: 17 });
    const farId = farSystem.add({ ...SHAMBLER, sight: 1, nightSight: 1 }, [0, 1, 0]);
    farSystem.tick(1 / 20);
    const curious = farSystem.store.get(farId)!;
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('far');
    expect(curious.lastPerceived).not.toEqual(distant.pos);

    curious.mode = 'chase';
    curious.lastPerceived = [3, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('near');
    expect(curious.lastPerceived).toEqual([3, 1, 0]);
    curious.mode = 'investigate';
    curious.investigationTier = 'near';
    curious.lastPerceived = [4, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('near');
    expect(curious.lastPerceived).toEqual([4, 1, 0]);
  });

  it('lets a far noise during search restart investigation from a new bearing', () => {
    const distant = player([50, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ZombieSystem({ ...senses(() => distant), seed: 27 });
    const id = system.add({ ...SHAMBLER, sight: 0.01, nightSight: 0.01 }, [0, 1, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    zombie.mode = 'search';
    zombie.searchAnchor = [0, 1, 0];
    zombie.searchTimer = 30;
    zombie.searchStrolling = false;
    const before = [...zombie.body.pos] as Vec3;
    system.tick(1 / 20);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('far');
    expect(zombie.lastPerceived).not.toEqual(distant.pos);
    expect(metres(zombie.lastPerceived!, before)).toBeCloseTo(SHAMBLER.hearingModel.investigationDistanceMetres, 5);
  });

  const advanceToMode = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    mode: string,
    maxTicks: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && zombie.mode !== mode; tick++) {
      system.tick(1 / 20);
    }
    return zombie.mode === mode;
  };
  const stayInsideSearch = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    ticks: number,
    radius: number,
  ): boolean => {
    let sawStroll = false;
    for (let tick = 0; tick < ticks; tick++) {
      system.tick(1 / 20);
      if (zombie.mode !== 'search' || metres(zombie.body.pos, zombie.searchAnchor!) > radius + 0.01) {
        return false;
      }
      sawStroll ||= zombie.searchStrolling;
    }
    return sawStroll;
  };
  const finishSearch = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    maxTicks: number,
    radius: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && zombie.mode === 'search'; tick++) {
      system.tick(1 / 20);
      if (zombie.mode === 'search' && metres(zombie.body.pos, zombie.searchAnchor!) > radius + 0.01) {
        return false;
      }
    }
    return zombie.mode === 'return';
  };

  it('searches around a near sound for its data duration and restarts around a second exact sound', () => {
    let noise = player([20, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ZombieSystem({ ...senses(() => noise), seed: 113 });
    const type = { ...SHAMBLER, sight: 0.01, nightSight: 0.01 };
    const zombie = system.store.get(system.add(type, [0, 1, 0]))!;
    zombie.body.onGround = true;
    expect(advanceToMode(system, zombie, 'investigate', 200)).toBe(true);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, zombie, 'search', 200)).toBe(true);
    expect(zombie.searchAnchor).toEqual([20, 1, 0]);
    for (let tick = 0; tick < 20; tick++) {
      system.tick(1 / 20);
      expect(zombie.mode).toBe('search');
    }

    noise = player([24, 1, 0], [-1, 0, 0], 'sprinting');
    system.tick(1 / 20);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('near');
    expect(zombie.lastPerceived).toEqual(noise.pos);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, zombie, 'search', 200)).toBe(true);
    expect(zombie.searchAnchor).toEqual([24, 1, 0]);
    expect(zombie.searchTimer).toBeGreaterThanOrEqual(type.hearingModel.searchSeconds.min);
    expect(zombie.searchTimer).toBeLessThanOrEqual(type.hearingModel.searchSeconds.max);

    const minSearchTicks = Math.floor((type.hearingModel.searchSeconds.min - 0.1) * 20);
    expect(stayInsideSearch(system, zombie, minSearchTicks, type.hearingModel.searchRadiusMetres)).toBe(true);
    expect(
      finishSearch(system, zombie, type.hearingModel.searchSeconds.max * 20 + 5, type.hearingModel.searchRadiusMetres),
    ).toBe(true);
    expect(advanceToMode(system, zombie, 'idle', 20 * 20)).toBe(true);
  });
});

describe('idle and stroll shambling', () => {
  it('uses seeded idle and straight stroll intervals over ten simulated minutes', () => {
    const sense = senses(() => player([1000, 1, 1000]));
    const system = new ZombieSystem({ ...sense, seed: 73 });
    const replay = new ZombieSystem({ ...sense, seed: 73 });
    const withExtraBody = new ZombieSystem({ ...sense, seed: 73 });
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const replayId = replay.add(SHAMBLER, [0, 1, 0]);
    const independentId = withExtraBody.add(SHAMBLER, [0, 1, 0]);
    withExtraBody.add(SHAMBLER, [100, 1, 100]);
    const zombie = system.store.get(id)!;
    const replayed = replay.store.get(replayId)!;
    const independent = withExtraBody.store.get(independentId)!;
    zombie.body.onGround = true;
    replayed.body.onGround = true;
    independent.body.onGround = true;
    let idleTicks = 0;
    let strollTicks = 0;
    for (let tick = 0; tick < 10 * 60 * 20; tick++) {
      system.tick(1 / 20);
      replay.tick(1 / 20);
      withExtraBody.tick(1 / 20);
      if (tick % 100 === 0) {
        expect(replayed.body.pos).toEqual(zombie.body.pos);
        expect(independent.body.pos).toEqual(zombie.body.pos);
        expect(replayed.behaviorRng.state()).toEqual(zombie.behaviorRng.state());
        expect(independent.behaviorRng.state()).toEqual(zombie.behaviorRng.state());
      }
      if (String(zombie.mode) === 'idle') {
        idleTicks += 1;
      }
      if (String(zombie.mode) === 'stroll') {
        strollTicks += 1;
      }
      expect(metres(zombie.body.pos, zombie.home)).toBeLessThanOrEqual(12.5);
    }
    expect(idleTicks / (10 * 60 * 20)).toBeGreaterThanOrEqual(0.2);
    expect(strollTicks / (10 * 60 * 20)).toBeGreaterThanOrEqual(0.2);
  });

  it('keeps strolls straight and turns the body and head during idle', () => {
    const system = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    let idleTurned = false;
    let strollingTicks = 0;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const yaw = (mesh: import('three').InstancedMesh): number => {
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      return Math.atan2(matrix.elements[8]!, matrix.elements[0]!);
    };
    let headLookObserved = false;
    for (let tick = 0; tick < 1200; tick++) {
      const mode = String(zombie.mode);
      const beforeFacing = Math.atan2(zombie.facing[0], zombie.facing[2]);
      const beforePosition = [...zombie.body.pos] as Vec3;
      system.tick(1 / 20);
      const afterFacing = Math.atan2(zombie.facing[0], zombie.facing[2]);
      const turn = Math.abs(Math.atan2(Math.sin(afterFacing - beforeFacing), Math.cos(afterFacing - beforeFacing)));
      if (mode === 'stroll') {
        strollingTicks += 1;
        expect((turn * 180) / Math.PI).toBeLessThanOrEqual(5);
      }
      if (mode === 'idle') {
        expect(metres(zombie.body.pos, beforePosition)).toBeLessThanOrEqual(0.01);
        idleTurned ||= turn > 1e-5;
        meshes.sync(system.store);
        headLookObserved ||=
          Math.abs(Math.atan2(Math.sin(yaw(parts[1]!) - yaw(parts[0]!)), Math.cos(yaw(parts[1]!) - yaw(parts[0]!)))) >
          0.01;
      }
    }
    expect(strollingTicks).toBeGreaterThan(0);
    expect(idleTurned).toBe(true);
    expect(headLookObserved).toBe(true);
  });

  it('interpolates 20 Hz chase poses between 60 Hz draws within facing and speed bounds', () => {
    let target: Vec3 = [20, 1, 0];
    const system = new ZombieSystem(senses(() => player(target)));
    const id = system.add({ ...SHAMBLER, sightCone: 180 }, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const bodyMesh = meshes.group.children[0] as import('three').InstancedMesh;
    meshes.sync(system.store);
    const pose = () => {
      const matrix = new Matrix4();
      bodyMesh.getMatrixAt(0, matrix);
      return {
        x: matrix.elements[12]!,
        z: matrix.elements[14]!,
        yaw: Math.atan2(matrix.elements[8]!, matrix.elements[0]!),
      };
    };
    let previous = pose();
    let previousSpeed = 0;
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        const angle = (frame / 60) * Math.PI;
        target = [20 * Math.cos(angle), 1, 20 * Math.sin(angle)];
        system.tick(1 / 20);
      }
      Reflect.apply(meshes.sync, meshes, [system.store, 1 / 60, (frame % 3) / 3]);
      const current = pose();
      const speed = Math.hypot(current.x - previous.x, current.z - previous.z) * BLOCK_SIZE * 60;
      const turn = Math.abs(Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(4);
      expect(Math.abs(speed - previousSpeed)).toBeLessThanOrEqual(0.25);
      previous = current;
      previousSpeed = speed;
    }

    const idleSystem = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const idleId = idleSystem.add(SHAMBLER, [0, 1, 0]);
    const idleZombie = idleSystem.store.get(idleId)!;
    idleZombie.body.onGround = true;
    idleZombie.modeTimer = 100;
    const idleMeshes = new ZombieMeshes(BLOCK_SIZE);
    const idleBody = idleMeshes.group.children[0] as import('three').InstancedMesh;
    idleMeshes.sync(idleSystem.store);
    const idlePose = () => {
      const matrix = new Matrix4();
      idleBody.getMatrixAt(0, matrix);
      return Math.atan2(matrix.elements[8]!, matrix.elements[0]!);
    };
    let previousYaw = idlePose();
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        idleSystem.tick(1 / 20);
      }
      Reflect.apply(idleMeshes.sync, idleMeshes, [idleSystem.store, 1 / 60, (frame % 3) / 3]);
      const currentYaw = idlePose();
      const turn = Math.abs(Math.atan2(Math.sin(currentYaw - previousYaw), Math.cos(currentYaw - previousYaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(6);
      previousYaw = currentYaw;
    }

    idleZombie.mode = 'stroll';
    idleZombie.modeTimer = 100;
    idleZombie.strollHeading = [1, 0, 0];
    previousYaw = idlePose();
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        idleSystem.tick(1 / 20);
      }
      Reflect.apply(idleMeshes.sync, idleMeshes, [idleSystem.store, 1 / 60, (frame % 3) / 3]);
      const currentYaw = idlePose();
      const turn = Math.abs(Math.atan2(Math.sin(currentYaw - previousYaw), Math.cos(currentYaw - previousYaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(4);
      previousYaw = currentYaw;
    }
  });
});
