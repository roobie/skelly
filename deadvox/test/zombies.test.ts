import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import { FISTS_MELEE, type PlayerSense, perceivePlayer, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
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
    expect(sees([15, 2, 0], 12, false, opaque, 'walking')).toBe(false);
  });
});

describe('shambler scenarios', () => {
  it('A: reaches the player through a real open wood_door entity within 20 seconds', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const target = [4.5, 1, -6] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1]), solid));
    const id = system.add(SHAMBLER, [9, 1, 6], [0, 0, -1]);
    run(system, 20);
    expect(metres(system.store.get(id)!.body.pos, target)).toBeLessThanOrEqual(1.2);
  });

  it('B: hears the sprinting player but cannot enter through the real closed door for 120 seconds', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, false);
    const target = [4.5, 1, -6] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1], 'sprinting'), solid));
    const id = system.add(SHAMBLER, [4.5, 1, 6], [0, 0, -1]);
    const positions: Vec3[] = [];
    let awareFrames = 0;
    run(system, 120, () => {
      const zombie = system.store.get(id)!;
      positions.push([...zombie.body.pos]);
      if (zombie.mode === 'chase' || zombie.mode === 'investigate') {
        awareFrames += 1;
      }
    });
    expect(awareFrames).toBeGreaterThan(120 * 60 * 0.9);
    expect(positions.every((position) => position[2] > 1)).toBe(true);
    const end = positions.at(-1)!;
    expect((end[2] - 1) * BLOCK_SIZE).toBeLessThanOrEqual(1.5);
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
      zombie.body.vel[0] = 1;
      zombie.shuffle = frame === 0 ? 0 : 0.3;
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
    expect(system.store.get(id)).toBeDefined();
  });
});
