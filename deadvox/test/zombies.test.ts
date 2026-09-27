import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { type Body, bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import { FISTS_MELEE, type PlayerSense, perceivePlayer, ZombieSystem } from '../src/core/zombies.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
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
    expect(sees([15, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([17, 2, 0], 12, false, opaque, 'jogging')).toBe(false);
    expect(sees([29, 2, 0], 12, false, opaque, 'sprinting')).toBe(true);
    expect(sees([31, 2, 0], 12, false, opaque, 'sprinting')).toBe(false);
    expect(sees([5, 2, 0], 12, false, opaque, 'walking')).toBe(true);
    expect(sees([7, 2, 0], 12, false, opaque, 'walking')).toBe(false);
    expect(sees([5, 2, 0], 12, false, opaque, 'still')).toBe(false);
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
    expect(ids.every((id) => system.store.get(id)!.body.pos[2] < -2)).toBe(true);
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
    run(system, 120);
    expect(metres(system.store.get(id)!.body.pos, [0, 1, 0])).toBeLessThanOrEqual(3);
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
        expect(system.store.get(id)!.mode).toBe('chase');
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
    run(wander, 10);
    const wanderingSteps = Math.floor(wanderer.gaitPhase / Math.PI);
    expect(wanderingSteps).toBeGreaterThanOrEqual(12);
    expect(wanderingSteps).toBeLessThanOrEqual(15);

    let target: Vec3 = [20, 1, 0];
    const chase = new ZombieSystem(senses(() => player(target, [-1, 0, 0])));
    const chaseId = chase.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const chaser = chase.store.get(chaseId)!;
    for (let frame = 0; frame < 600; frame++) {
      target = [target[0] + 2.8 / 60 / BLOCK_SIZE, target[1], target[2]];
      chase.tick(1 / 60);
    }
    const chasingSteps = Math.floor(chaser.gaitPhase / Math.PI);
    expect(chasingSteps).toBeGreaterThanOrEqual(42);
    expect(chasingSteps).toBeLessThanOrEqual(52);

    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 10);
    const blocked = new ZombieSystem(senses(() => player([10, 1, 0], [-1, 0, 0], 'sprinting'), wall));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const blockedZombie = blocked.store.get(blockedId)!;
    run(blocked, 2);
    expect(blockedZombie.mode).toBe('chase');
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
