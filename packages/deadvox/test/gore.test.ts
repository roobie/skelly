import { BoxGeometry, InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { posedFusedMassRegionBoxes } from '../src/core/actorRegions.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { projectileShot } from '../src/core/pellets.ts';
import { actorPoseInputFor, fusedMassTypeOf, missingFlesh } from '../src/engine/pose.ts';
import { type Actor, BODY_REGIONS, type BodyRegion, type HitImpulse } from '../src/engine/sim.ts';
import { BLOCK_SIZE, makeScale, type Vec3 } from '../src/engine/world.ts';
import { Gore, type GoreBodies } from '../src/render/gore.ts';
import { PLAYER_REGION_BOXES } from '../src/render/playerFigure.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { physicsFor, WORLD_GRAVITY } from './playerFixture.ts';
import { GORE_TUNING_FIXTURE } from './presentationFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const floor = (_x: number, y: number, _z: number) => y < 0;
// A heavy downward hit just above the floor, so most droplets land within a few updates.
const lowHit: HitImpulse = { point: [0.5, 0.05, 0.5], direction: [0, -1, 0], impulse: 4 };
/** A wound dripping at the base rate and size. */
const BASE_DRIP = { rate: 1, size: 1 };

describe('Gore', () => {
  it('lights droplets and splats as the world is lit, shadows included', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const meshes = gore.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    expect(meshes).toHaveLength(2);
    expect(meshes.every((mesh) => mesh.material instanceof MeshLambertMaterial)).toBe(true);
    expect(meshes.every((mesh) => mesh.receiveShadow)).toBe(true);
    gore.dispose();
  });

  it('starts at most the per-frame budget of droplets between two updates, however much is sprayed', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    for (let spray = 0; spray < GORE_TUNING_FIXTURE.dropletCap; spray++) {
      gore.spray(lowHit, 100);
    }
    expect(gore.activeDroplets).toBe(GORE_TUNING_FIXTURE.dropletSpawnsPerFrame);
    gore.dispose();
  });

  it("gives a severed part's blood the part's launch velocity", () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const partVelocity: Vec3 = [3, 0, 0];
    gore.severed(lowHit, partVelocity, {
      droplets: 2,
      speedMetresPerRealSecond: 0,
      spreadFraction: 0,
      lifetimeRealSeconds: 1,
      partVelocityShare: 1,
    });
    const { droplets } = gore as unknown as { droplets: { active: boolean; velocity: Vector3 }[] };
    const live = droplets.filter((droplet) => droplet.active);
    expect(live).toHaveLength(2);
    for (const droplet of live) {
      expect(droplet.velocity.x).toBeCloseTo(partVelocity[0]);
    }
    gore.dispose();
  });

  it.each(BODY_REGIONS)('starts $0 drips inside the drawn region in both views', (region) => {
    const yaw = 0.37;
    const playerPos: [number, number, number] = [4, 2, 7];
    const drip = (bleeding: BodyRegion) => (bleeding === region ? BASE_DRIP : undefined);

    const dripPosition = (thirdPerson: boolean): Vector3 => {
      const gore = new Gore(BLOCK_SIZE, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
      gore.update(1, floor, {
        actors: new MapEntityStore<Actor>(),
        listener: playerPos,
        player: { pos: playerPos, yaw, drip, thirdPerson },
      });
      expect(gore.activeDroplets).toBe(1);
      const mesh = gore.group.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
      if (!mesh) {
        throw new Error('Gore has no droplet mesh');
      }
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      const position = new Vector3().setFromMatrixPosition(matrix);
      gore.dispose();
      return position;
    };

    const regionBox = PLAYER_REGION_BOXES[region];
    const assertWithinDrawnRegion = (origin: Vector3): void => {
      const figureOrigin = new Vector3(...playerPos).multiplyScalar(BLOCK_SIZE);
      const worldX = origin.x - figureOrigin.x;
      const worldZ = origin.z - figureOrigin.z;
      const local = new Vector3(
        worldX * Math.cos(yaw) - worldZ * Math.sin(yaw),
        origin.y - figureOrigin.y,
        worldX * Math.sin(yaw) + worldZ * Math.cos(yaw),
      );
      const epsilon = 1e-5;
      for (const axis of [0, 1, 2] as const) {
        const halfSize = regionBox.size[axis] / 2;
        expect(local.getComponent(axis)).toBeGreaterThanOrEqual(regionBox.at[axis] - halfSize - epsilon);
        expect(local.getComponent(axis)).toBeLessThanOrEqual(regionBox.at[axis] + halfSize + epsilon);
      }
    };

    assertWithinDrawnRegion(dripPosition(false));
    assertWithinDrawnRegion(dripPosition(true));
  });

  it('drips a wounded amalgam from its own flesh, never from the air in its bounding box', () => {
    const registry = baseRegistry();
    const scale = makeScale(0.5);
    const actors = new ActorSystem({
      player: () => ({
        pos: [40, 1, 40],
        facing: [-1, 0, 0],
        movement: 'still',
        lit: false,
        lightSeenFrom: 40,
        eyeHeightMetres: 1.3,
      }),
      isSolid: (_x, y) => y === 0,
      isOpaque: (_x, y) => y === 0,
      dayPhase: () => dayStateAtHour(12),
      blockSize: scale.blockSize,
      physics: physicsFor(scale),
      tuning: TEST_SENSE_TUNING,
      hurtPlayer: () => undefined,
      actorFigureFiles: stackActorFigureFiles(registry),
      seed: 17,
    });
    const type = fusedMassTypeOf(registry.actors)!;
    const id = actors.add(type, [3, 1, 5], [0.6, 0, -0.8]);
    const actor = actors.store.get(id)!;
    const figure = actors.figureFor(type, actor.figureSeed).fusedMass!;
    const { dims, owner, size, origin } = figure.grid;
    // A shot into its core from in front wounds it and leaves a hole, so carved cells are on hand to be
    // wrongly dripped from.
    const healthBefore = { ...actor.regions };
    const core = posedFusedMassRegionBoxes(
      actorPoseInputFor(actor, id, { blockSize: scale.blockSize, actorFigureFiles: stackActorFigureFiles(registry) }),
    )['core.trunk']![0]!.voxelCentroid;
    const from = core.map((value, axis) => value + (actor.facing[axis]! * 4) / scale.blockSize) as Vec3;
    const buck = registry.items.get('shell_12_gauge_00_buck')!.ammo!;
    const toward = actor.facing.map((value) => -value) as Vec3;
    expect(actors.firePellets(projectileShot(buck, from, new Array(buck.pellets).fill(toward))).hits).toBeGreaterThan(
      0,
    );
    expect(actors.store.get(id)).toBe(actor);
    expect(actor.incapacitated).toBe(false);
    expect(actor.carved.length).toBeGreaterThan(0);
    expect(Object.keys(healthBefore).some((region) => actor.regions[region]! < healthBefore[region]!)).toBe(true);
    const missing = missingFlesh(figure, actor);

    const gore = new Gore(scale.blockSize, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const origins: Vector3[] = [];
    const spy = gore as unknown as { emit: (at: Vector3, ...rest: unknown[]) => boolean };
    const emit = spy.emit.bind(gore);
    spy.emit = (at, ...rest) => {
      origins.push(at.clone());
      return emit(at, ...rest);
    };
    const bodies: GoreBodies = {
      actors: actors.store,
      listener: actor.body.pos,
      fusedMass: (body) => (body === actor ? figure : undefined),
    };
    for (let frame = 0; frame < 200; frame++) {
      gore.update(0.1, () => false, bodies);
    }
    expect(origins.length).toBeGreaterThan(0);

    // Each origin, back in the figure's rest grid (facing -z, from its ground origin), lies in a live flesh cell.
    const metres = size * figure.scale;
    const yaw = Math.atan2(-actor.facing[0], -actor.facing[2]);
    const [px, py, pz] = actor.body.pos.map((value) => value * scale.blockSize) as Vec3;
    for (const at of origins) {
      const dx = at.x - px;
      const dz = at.z - pz;
      const rest = [
        (dx * Math.cos(yaw) - dz * Math.sin(yaw) - figure.originOffset[0]) / metres - origin[0] + 0.5,
        (at.y - py - figure.originOffset[1]) / metres - origin[1] + 1e-6,
        (dx * Math.sin(yaw) + dz * Math.cos(yaw) - figure.originOffset[2]) / metres - origin[2] + 0.5,
      ].map(Math.floor) as Vec3;
      const inside = rest.every((value, axis) => value >= 0 && value < dims[axis]!);
      const cell = rest[0] + rest[1] * dims[0] + rest[2] * dims[0] * dims[1];
      const bone = inside ? owner[cell]! : 0;
      expect({ at: at.toArray(), cell: rest, live: bone > 0 && !missing.carved.has(cell) }).toMatchObject({
        live: true,
      });
    }
    gore.dispose();
  });

  it('stops player wound drips once the wound stops bleeding', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const bodies: GoreBodies = {
      actors: new MapEntityStore<Actor>(),
      listener: [0, 0, 0],
      player: {
        pos: [0, 0, 0],
        yaw: 0,
        drip: (region) => (region === 'leftArm' ? BASE_DRIP : undefined),
        thirdPerson: false,
      },
    };

    gore.update(1, floor, bodies);
    expect(gore.activeDroplets).toBeGreaterThan(0);
    gore.update(3, floor, { ...bodies, player: { ...bodies.player!, drip: () => undefined } });
    expect(gore.activeDroplets).toBe(0);
    gore.dispose();
  });

  it('keeps droplets and splats within their pools under a flood of sprays', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const frames = Math.ceil(GORE_TUNING_FIXTURE.splatCap / GORE_TUNING_FIXTURE.dropletSpawnsPerFrame) * 3;
    for (let frame = 0; frame < frames; frame++) {
      for (let spray = 0; spray < GORE_TUNING_FIXTURE.dropletCap; spray++) {
        gore.spray(lowHit, 100);
      }
      expect(gore.activeDroplets).toBeLessThanOrEqual(GORE_TUNING_FIXTURE.dropletCap);
      gore.update(1 / 60, floor);
      expect(gore.activeSplats).toBeLessThanOrEqual(GORE_TUNING_FIXTURE.splatCap);
    }
    // The splat ring filled and then reused its oldest entries instead of growing.
    expect(gore.activeSplats).toBe(GORE_TUNING_FIXTURE.splatCap);
    gore.dispose();
  });

  it('throws flesh chunks on a carve and a hard hit, drawn from a bounded pool until they fade', () => {
    const chunks = {
      models: ['fixture_chunk'],
      cap: 5,
      perThrow: [2, 2] as [number, number],
      hardHitDamage: 30,
      speedMetresPerRealSecond: { min: 1, max: 1 },
      spreadFraction: 0,
      spinRadiansPerRealSecond: { min: 1, max: 1 },
      scale: { min: 1, max: 1 },
      lifetimeRealSeconds: 10,
      fadeRealSeconds: 1,
      landedSplatRadiusMetres: { min: 0.1, max: 0.1 },
    };
    const geometry = new BoxGeometry(0.05, 0.05, 0.05);
    const material = new MeshLambertMaterial();
    const parts = [{ geometry, material, matrix: new Matrix4() }];
    const gore = new Gore(
      1,
      WORLD_GRAVITY,
      { ...GORE_TUNING_FIXTURE, chunks },
      {
        models: { groundParts: (id) => (id === 'fixture_chunk' ? parts : undefined) },
      },
    );
    const drawn = () =>
      gore.group.children.find(
        (child): child is InstancedMesh => child instanceof InstancedMesh && child.geometry === geometry,
      )?.count;

    gore.wounded(lowHit, chunks.hardHitDamage - 1);
    expect(gore.activeChunks).toBe(0);
    gore.wounded(lowHit, chunks.hardHitDamage);
    expect(gore.activeChunks).toBe(2);
    for (let carve = 0; carve < 3; carve++) {
      gore.carved(lowHit, 1);
    }
    // The pool reused its oldest chunks instead of growing.
    expect(gore.activeChunks).toBe(chunks.cap);
    gore.update(1 / 60, floor);
    expect(drawn()).toBe(chunks.cap);
    gore.update(chunks.lifetimeRealSeconds, floor);
    expect(gore.activeChunks).toBe(0);
    expect(drawn()).toBe(0);
    gore.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('throws flesh chunks back out of the wound toward the attacker, not on into the body', () => {
    const chunks = {
      models: ['fixture_chunk'],
      cap: 16,
      perThrow: [4, 4] as [number, number],
      hardHitDamage: 30,
      speedMetresPerRealSecond: { min: 1, max: 2 },
      spreadFraction: 0.6,
      spinRadiansPerRealSecond: { min: 1, max: 1 },
      scale: { min: 1, max: 1 },
      lifetimeRealSeconds: 10,
      fadeRealSeconds: 1,
      landedSplatRadiusMetres: { min: 0.1, max: 0.1 },
    };
    const gore = new Gore(1, WORLD_GRAVITY, { ...GORE_TUNING_FIXTURE, chunks });
    const strike: HitImpulse = { point: [0.5, 1.5, 0.5], direction: [1, 0, 0], impulse: 4 };
    for (let carve = 0; carve < 4; carve++) {
      gore.carved(strike, 1);
    }
    const thrown = (gore as unknown as { chunks: { active: boolean; velocity: Vector3 }[] }).chunks.filter(
      (chunk) => chunk.active,
    );
    expect(thrown.length).toBeGreaterThan(0);
    for (const chunk of thrown) {
      expect(chunk.velocity.dot(new Vector3(...strike.direction))).toBeLessThan(0);
    }
    gore.dispose();
  });

  it('ends the splat a chunk lands on with the chunk, never leaving it bare', () => {
    const chunks = {
      models: ['fixture_chunk'],
      cap: 4,
      perThrow: [2, 2] as [number, number],
      hardHitDamage: 30,
      speedMetresPerRealSecond: { min: 1, max: 1 },
      spreadFraction: 0,
      spinRadiansPerRealSecond: { min: 1, max: 1 },
      scale: { min: 1, max: 1 },
      lifetimeRealSeconds: 10,
      fadeRealSeconds: 1,
      landedSplatRadiusMetres: { min: 0.1, max: 0.1 },
    };
    const gore = new Gore(1, WORLD_GRAVITY, { ...GORE_TUNING_FIXTURE, chunks });
    // A hard hit throws chunks and no spray, so every splat here is one a chunk landed on.
    gore.wounded(lowHit, chunks.hardHitDamage);
    for (let frame = 0; frame < 120 && gore.activeSplats < 2; frame++) {
      gore.update(1 / 60, floor);
    }
    expect(gore.activeChunks).toBe(2);
    expect(gore.activeSplats).toBe(2);
    // Bounded, so a chunk that outlives its lifetime fails here rather than hanging.
    for (let frame = 0; frame < (chunks.lifetimeRealSeconds + 1) * 60 && gore.activeChunks > 0; frame++) {
      gore.update(1 / 60, floor);
    }
    expect(gore.activeChunks).toBe(0);
    expect(gore.activeSplats).toBe(0);
    gore.dispose();
  });

  describe('when a throw reuses a landed chunk before it expires', () => {
    const chunks = {
      models: ['fixture_chunk'],
      cap: 2,
      perThrow: [2, 2] as [number, number],
      hardHitDamage: 30,
      speedMetresPerRealSecond: { min: 1, max: 1 },
      spreadFraction: 0,
      spinRadiansPerRealSecond: { min: 1, max: 1 },
      scale: { min: 1, max: 1 },
      lifetimeRealSeconds: 10,
      fadeRealSeconds: 1,
      landedSplatRadiusMetres: { min: 0.1, max: 0.1 },
    };
    const farHit: HitImpulse = { ...lowHit, point: [9.5, 0.05, 9.5] };
    /** A pool of two chunks, both landed on their splats; hard hits throw chunks and no spray. */
    const landedPool = (splatCap: number) => {
      const gore = new Gore(1, WORLD_GRAVITY, { ...GORE_TUNING_FIXTURE, splatCap, chunks });
      gore.wounded(lowHit, chunks.hardHitDamage);
      for (let frame = 0; frame < 120 && gore.activeSplats < 2; frame++) {
        gore.update(1 / 60, floor);
      }
      return gore;
    };

    it('ends the old chunk splats with them, leaving none bare where the chunks were', () => {
      const gore = landedPool(GORE_TUNING_FIXTURE.splatCap);
      expect([gore.activeChunks, gore.activeSplats]).toEqual([2, 2]);
      gore.wounded(farHit, chunks.hardHitDamage);
      expect(gore.activeChunks).toBe(2);
      expect(gore.activeSplats).toBe(0);
      gore.dispose();
    });

    it('keeps a splat that has since reused the old chunk splat slot', () => {
      // A two-slot splat pool: these two splats take the slots the chunks landed on.
      const gore = landedPool(2);
      expect([gore.activeChunks, gore.activeSplats]).toEqual([2, 2]);
      gore.landed([3.5, 0, 3.5]);
      gore.landed([5.5, 0, 5.5]);
      gore.wounded(farHit, chunks.hardHitDamage);
      expect(gore.activeChunks).toBe(2);
      expect(gore.activeSplats).toBe(2);
      gore.dispose();
    });
  });
});
