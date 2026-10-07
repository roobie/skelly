import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { amalgamCollisionEnvelope, amalgamFigure } from '../src/core/amalgamFigure.ts';
import { buildRegistry } from '../src/core/content.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { projectileShot } from '../src/core/pellets.ts';
import { type Body, stepBodyHorizontal } from '../src/core/physics.ts';
import { posedAmalgamRegionBoxes } from '../src/core/zombieRegions.ts';
import {
  activeAmalgamMembers,
  FISTS_MELEE,
  type PlayerSense,
  ZombieSystem,
  zombieAttackReachMetres,
} from '../src/core/zombies.ts';
import { physicsFor, PLAYER } from '../src/game/player.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { capture, contentLookup, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const BLOCK_SIZE = makeScale(0.5).blockSize;
const FLOOR = (_x: number, y: number): boolean => y === 0;
const player = (): PlayerSense => ({
  pos: [20, 1, 20],
  facing: [-1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
});
const system = (): ZombieSystem =>
  new ZombieSystem({
    player,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    seed: 17,
  });

const findMemberRay = (simulation: ZombieSystem, id: number) => {
  const zombie = simulation.store.get(id)!;
  const figure = amalgamFigure(zombie.figureSeed);
  const regions = posedAmalgamRegionBoxes(figure, {
    position: zombie.body.pos,
    facing: zombie.facing,
    blockSize: BLOCK_SIZE,
    severed: zombie.severed,
  });
  const weapon = { damage: 0, reach: 4, cooldown: 0 };
  const directions: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
    [0, -1, 0],
  ];
  for (const member of activeAmalgamMembers(zombie)) {
    for (const regionId of member.regionIds) {
      for (const box of regions[regionId] ?? []) {
        for (const direction of directions) {
          const origin: Vec3 = [
            box.voxelCentroid[0] - (direction[0] * 3) / BLOCK_SIZE,
            box.voxelCentroid[1] - (direction[1] * 3) / BLOCK_SIZE,
            box.voxelCentroid[2] - (direction[2] * 3) / BLOCK_SIZE,
          ];
          const aim = simulation.aimAt(origin, direction, weapon);
          if (aim?.id === id && aim.region === regionId) {
            return { origin, direction, partId: member.partId, regionId };
          }
        }
      }
    }
  }
  throw new Error('Could not aim at an exposed amalgam member region');
};

describe('amalgam body and combat seam', () => {
  it('derives a tight collision envelope and region boxes from the realized body manifest', () => {
    expect(registry.zombies.get('amalgam')?.debugOnly).toBe(true);
    const figure = amalgamFigure(3);
    const envelope = amalgamCollisionEnvelope(figure, BLOCK_SIZE);
    const { bounds, originOffset } = figure;
    const localMin = [bounds.min[0] + originOffset[0], bounds.min[1] + originOffset[1], bounds.min[2] + originOffset[2]];
    const localMax = [bounds.max[0] + originOffset[0], bounds.max[1] + originOffset[1], bounds.max[2] + originOffset[2]];

    expect(localMin[1]).toBeCloseTo(0);
    expect(envelope.halfWidth * BLOCK_SIZE).toBeCloseTo(Math.max(Math.abs(localMin[0]!), Math.abs(localMax[0]!)));
    expect(envelope.halfDepth * BLOCK_SIZE).toBeCloseTo(Math.max(Math.abs(localMin[2]!), Math.abs(localMax[2]!)));
    expect(envelope.height * BLOCK_SIZE).toBeCloseTo(localMax[1]! - localMin[1]!);

    for (const region of figure.manifest.regions) {
      expect(figure.boxes[region.id]?.length, region.id).toBeGreaterThan(0);
      for (const box of figure.boxes[region.id]!) {
        expect(region.boneIds).toContain(box.bone);
      }
    }
  });

  it('uses the realized rectangular envelope to stop at solid walls and closed doors', () => {
    const envelope = amalgamCollisionEnvelope(amalgamFigure(5), BLOCK_SIZE);
    for (const obstacle of ['wall', 'closed door']) {
      const body: Body = {
        pos: [-(envelope.halfWidth + 2), 0, 0],
        vel: [0, 0, 0],
        halfWidth: envelope.halfWidth,
        halfDepth: envelope.halfDepth,
        height: envelope.height,
        onGround: true,
      };
      const solid = (x: number, y: number, z: number): boolean => x === 0 && y === 0 && z === 0;
      stepBodyHorizontal(body, {
        dx: envelope.halfWidth + 4,
        dz: 0,
        isSolid: solid,
        params: { gravity: 0, stepHeight: 0 },
      });
      expect(body.pos[0], obstacle).toBeLessThan(-envelope.halfWidth);
    }
  });

  it('routes a firearm projectile hit into the manifest-backed amalgam region', () => {
    const simulation = system();
    const id = simulation.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const ray = findMemberRay(simulation, id);
    const before = { ...zombie.regions };

    expect(
      simulation.firePellets(
        projectileShot(
          { calibre: 'test', pellets: 1, damage: 1, impulse: 0, rangeMetres: 50, diameterMm: 5 },
          ray.origin,
          [ray.direction],
        ),
      ),
    ).toBe(1);
    expect(zombie.regions[ray.regionId]).toBeLessThan(before[ray.regionId]!);
    expect(
      Object.keys(before).filter((region) => zombie.regions[region] !== before[region]),
    ).toEqual([ray.regionId]);
  });

  it('removes a severed member from attack reach while preserving the other members', () => {
    const simulation = system();
    const id = simulation.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const reach = zombieAttackReachMetres(zombie);
    const severOne = () => {
      const ray = findMemberRay(simulation, id);
      const damage = zombie.regions[ray.regionId]! + 1;
      expect(
        simulation.swing(ray.origin, ray.direction, {
          ...FISTS_MELEE,
          damage,
          reach: 4,
          impulse: 0,
        }),
      ).toBe(id);
    };

    expect(reach).toBeGreaterThan(0);
    severOne();
    expect(activeAmalgamMembers(zombie).length).toBeGreaterThan(0);
    expect(zombieAttackReachMetres(zombie)).toBe(reach);
    const noMembers = {
      ...zombie,
      severed: [
        ...zombie.severed,
        ...amalgamFigure(zombie.figureSeed).manifest.parts.filter((part) => part.severable).map((part) => part.id),
      ],
    };
    expect(activeAmalgamMembers(noMembers)).toHaveLength(0);
    expect(zombieAttackReachMetres(noMembers)).toBe(0);
  });

  it('round-trips an amalgam seed, dynamic regions and rectangular envelope through the save codec', async () => {
    const runtime = createRuntime();
    const id = runtime.zombies.add(registry.zombies.get('amalgam')!, [0, 1, 0]);
    const original = runtime.zombies.store.get(id)!;
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
      contentLookup,
      version: formatVersion,
    });
    const saved = decoded.snapshot.world.zombies.zombies.find(({ zombie }) => zombie.type === 'amalgam')?.zombie;

    expect(saved?.figureSeed).toBe(original.figureSeed);
    expect(saved?.regions).toEqual(original.regions);
    expect(saved?.body.halfWidth).toBe(original.body.halfWidth);
    expect(saved?.body.halfDepth).toBe(original.body.halfDepth);
    expect(saved?.body.height).toBe(original.body.height);
  });

  it('severs one manifest member, preserves the core and other members, and restores that state', () => {
    const simulation = system();
    const type = registry.zombies.get('amalgam')!;
    const id = simulation.add(type, [0, 1, 0]);
    const zombie = simulation.store.get(id)!;
    const figure = amalgamFigure(zombie.figureSeed);
    const membersBefore = activeAmalgamMembers(zombie);
    const ray = findMemberRay(simulation, id);
    const target = membersBefore.find((member) => member.partId === ray.partId)!;
    const regionId = ray.regionId;
    const before = { ...zombie.regions };

    expect(
      simulation.swing(ray.origin, ray.direction, {
        ...FISTS_MELEE,
        damage: before[regionId]! + 1,
        reach: 4,
        impulse: 0,
      }),
    ).toBe(id);
    expect(zombie.severed).toContain(target.partId);
    expect(zombie.regions['core.trunk']).toBe(before['core.trunk']);
    for (const region of Object.keys(before)) {
      if (region.startsWith(`${target.partId}.`) && region !== regionId) {
        expect(zombie.regions[region]).toBe(before[region]);
      }
    }
    expect(activeAmalgamMembers(zombie).map(({ partId }) => partId)).toEqual(
      membersBefore.filter(({ partId }) => partId !== target.partId).map(({ partId }) => partId),
    );

    const boxesAfter = posedAmalgamRegionBoxes(figure, {
      position: zombie.body.pos,
      facing: zombie.facing,
      blockSize: BLOCK_SIZE,
      severed: zombie.severed,
    });
    for (const region of target.regionIds) {
      expect(boxesAfter[region]).toHaveLength(0);
    }
    expect(boxesAfter['core.trunk']!.length).toBeGreaterThan(0);

    const saved = simulation.snapshotState();
    const restored = system();
    restored.restoreState(saved, (typeId) => registry.zombies.get(typeId));
    expect(restored.snapshotState()).toEqual(saved);
    expect(activeAmalgamMembers(restored.store.get(id)!).map(({ partId }) => partId)).toEqual(
      activeAmalgamMembers(zombie).map(({ partId }) => partId),
    );
  });
});
