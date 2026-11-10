import { describe, expect, it } from 'vitest';
import { actorPoseInputFor } from '../src/core/actorPose.ts';
import { posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import { perceivePlayer } from '../src/core/agentPerception.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import { foliageRustle, initialRustleClock } from '../src/core/foliageRustle.ts';
import { footstepEventForBlock } from '../src/core/footsteps.ts';
import { Forest } from '../src/core/forest.ts';
import { PlayerCombat } from '../src/core/playerCombat.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { rectsOverlap } from '../src/core/site.ts';
import { siteGenerationOf, sitePalette } from '../src/core/sitePalette.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';
import { simSeconds } from '../src/core/time.ts';
import { forestDensityAt, leafLitterAt, placeTree, stampTrees, TreeIndex } from '../src/core/vegetation.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { physicsFor } from './playerFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);
const soundTuning = { hearingRangeScale: 0.5, gain: 0.5, cutoffHz: 1200, clearGain: 1, clearCutoffHz: 18_000 };
const senseTuning = {
  id: 'fixture_player',
  chestEyeFraction: 0.62,
  crouchProneHoldRealSeconds: 0.5,
  crouch: {
    hearingRangeScale: 0.5,
    sightRangeScale: 0.5,
  },
  prone: registry.senses.get('player')!.prone,
  wall: soundTuning,
  footsteps: registry.senses.get('player')!.footsteps,
  vocalNoiseLifetimeSimSeconds: registry.senses.get('player')!.vocalNoiseLifetimeSimSeconds,
  actorVoice: registry.senses.get('player')!.actorVoice,
  light: {
    playerDaySightScale: 0,
    lureRangeScale: 0,
    throwMaxDistanceMetres: 8,
    throwChargeSimSeconds: simSeconds(1.25),
    throwMinimumHoldSimSeconds: simSeconds(0.8),
    throwStanceDropHoldRealSeconds: 1,
    wornLightToggleHoldRealSeconds: 1,
    renderedBeamLimit: 3,
    renderedFixtureLimit: 4,
    throwArmSpeedMetresPerRealSecond: 6,
    throwArmEnergyJoules: 20,
    groundLight: { senseHeightMetres: 0.075, renderLiftMetres: 0.4 },
    illumination: { pointDecay: 1, nearFieldMetres: 4, readingThreshold: 0.6 },
  },
};

const verticalBrushSession = (spawnY: number) => {
  const world = new World();
  const entities = new BlockEntities(registry);
  for (let x = 0; x < 8; x++) {
    for (let z = -8; z < 8; z++) {
      world.setBlock(x, 0, z, registry.blockIds.get('stone')!);
      for (let y = 4; y <= 6; y++) {
        world.setBlock(x, y, z, registry.blockIds.get('leaves')!);
      }
    }
  }
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    entities,
    isSolid: worldSolid(world, registry, entities),
    isOpaque: worldOpaque(world, registry, entities),
    scale,
    seed: 73,
    start: 43_200,
    spawn: [2.5, spawnY, 2.5],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE, walk: true }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => false },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in vegetation fixture');
    },
  });
  session.sim.paused = false;
  const reader = session.sim.events.reader();
  for (let frame = 0; frame < 60; frame++) {
    session.frame(1 / 60);
  }
  return {
    body: session.body,
    events: reader
      .read()
      .filter((event) => (event.kind === 'sound' || event.kind === 'noise') && event.event === 'foliage_rustle'),
  };
};

describe('passable but opaque vegetation', () => {
  it('keeps foliage opaque to sight/rays but passable to bodies, attacks and acoustic rays', () => {
    const world = new World();
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    const entities = new BlockEntities(registry);
    const solid = worldSolid(world, registry, entities);
    const opaque = worldOpaque(world, registry, entities);
    const sense = () =>
      perceivePlayer({
        def: registry.actors.get('shambler')!,
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: {
          pos: [10, 2, 0],
          facing: [-1, 0, 0],
          movement: 'still',
          lit: false,
          lightSeenFrom: 40,
          eyeHeightMetres: 1.3,
        },
        dayPhase: dayStateAtHour(12).phase,
        sightBlend: dayStateAtHour(12).sightBlend,
        blockSize: 0.5,
        isSolid: opaque,
        tuning: senseTuning,
      });
    expect(sense()).toBe(true);
    for (const name of ['tree_trunk', 'tree_branch', 'leaves', 'leaf_litter']) {
      const id = registry.blockIds.get(name)!;
      const blocksMovement = name !== 'leaves';
      expect(registry.blocks[id]!.solid, name).toBe(blocksMovement);
      expect(registry.blocks[id]!.opaque, name).toBe(true);
      for (let y = 0; y < 8; y++) {
        chunk.set(4, y, 0, id);
      }
      expect(solid(4, 4, 0), name).toBe(blocksMovement);
      expect(
        soundOcclusion({
          listener: [0.5, 4.5, 0.5],
          source: [10.5, 4.5, 0.5],
          isSolid: solid,
          globalWall: senseTuning.wall,
        }).occluded,
        name,
      ).toBe(blocksMovement);
      expect(raycast([0.5, 4.5, 0.5], [1, 0, 0], 10, opaque)?.block, name).toEqual([4, 4, 0]);
      expect(sense(), name).toBe(false);
    }
  });

  it('hides targets from actual zombie sight and aim while player melee still contacts through foliage', () => {
    const world = new World();
    const entities = new BlockEntities(registry);
    for (let x = -3; x < 4; x++) {
      for (let y = 1; y < 10; y++) {
        world.setBlock(x, y, 4, registry.blockIds.get('leaves')!);
      }
    }
    const movement = worldSolid(world, registry, entities);
    const opaque = worldOpaque(world, registry, entities);
    const player = {
      pos: [0.5, 1, 0.5] as [number, number, number],
      facing: [0, 0, 1] as [number, number, number],
      movement: 'still' as const,
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    };
    const hits: number[] = [];
    const figures = stackActorFigureFiles(registry);
    const system = new ActorSystem({
      isSolid: (x, y, z) => y === 0 || movement(x, y, z),
      isOpaque: opaque,
      blockSize: 0.5,
      physics: physicsFor(scale),
      tuning: senseTuning,
      actorFigureFiles: figures,
      player: () => player,
      dayPhase: () => dayStateAtHour(12),
      hurtPlayer: () => undefined,
      onMeleeResult: (result) => hits.push(result.damage),
    });
    const playerCombat = new PlayerCombat(system);
    const id = system.add(registry.actors.get('shambler')!, [0.5, 1, 8.5], [0, 0, -1]);
    system.tick(1 / 20);
    const actor = system.store.get(id)!;
    expect(actor.agent!.mode).not.toBe('chase');
    system.setFrozen(true);
    const { center } = posedHumanoidRegionBoxes(
      actorPoseInputFor(actor, id, { blockSize: 0.5, actorFigureFiles: figures }),
    ).head.find((box) => box.bone === 'head')!;
    const origin: [number, number, number] = [center[0], center[1], 0.5];
    const direction: [number, number, number] = [0, 0, 1];
    const weapon = {
      type: 'blunt',
      motion: 'swing' as const,
      damage: 1,
      reach: 6,
      cooldown: 0.8,
      contactFraction: 0.4,
      windupCapSimSeconds: 0.25,
      stamina: 0,
      impulse: 0,
    };
    expect(system.aimAt(origin, direction, weapon)).toBeUndefined();
    expect(
      playerCombat.beginMeleeSwing({
        origin,
        direction,
        weapon,
        profile: 'blunt',
        twoHanded: false,
        hands: { right: null, left: null },
      }),
    ).toBe(true);
    for (let frame = 0; frame < 40; frame++) {
      playerCombat.tick(1 / 60, { right: null, left: null });
    }
    expect(hits).toEqual([1]);
  });

  it('rustles on entry and after its content cooldown only while moving, with the gait content event', () => {
    const foliage = registry.blocks.findIndex((block) => block?.rustle !== undefined);
    expect(foliage).toBeGreaterThan(0);
    const { gentle, fast: fastEvent } = registry.blocks[foliage]!.rustle!;
    const interval = (event: string) => registry.sounds.get(event)!.minIntervalSimSeconds;
    expect(interval(gentle)).toBeGreaterThan(0);
    const world = new World();
    world.setBlock(2, 2, 2, foliage);
    world.setBlock(3, 2, 2, foliage);
    const body = {
      pos: [2.5, 2, 2.5] as [number, number, number],
      vel: [0, 0, 0] as [number, number, number],
      halfWidth: 0.2,
      height: 0.8,
      onGround: false,
    };
    const sample = { body, world, registry, gait: 'walking' as const, moving: true, time: 0 };
    const entry = foliageRustle(initialRustleClock(), sample);
    expect(entry.sound?.event).toBe(gentle);
    expect(entry.clock.nextSimTimestamp).toBe(interval(gentle));
    const due = interval(gentle);
    expect(foliageRustle(entry.clock, { ...sample, time: due / 2 }).sound).toBeUndefined();
    expect(foliageRustle(entry.clock, { ...sample, time: due, moving: false }).sound).toBeUndefined();
    expect(foliageRustle(entry.clock, { ...sample, time: due }).sound?.event).toBe(gentle);
    body.pos[0] = 3.5;
    const enteredAt = due / 2;
    const fast = foliageRustle(entry.clock, { ...sample, gait: 'sprinting', time: enteredAt });
    expect(fast.sound?.event).toBe(fastEvent);
    expect(fast.clock.nextSimTimestamp).toBe(enteredAt + interval(fastEvent));
    expect(
      foliageRustle(fast.clock, { ...sample, gait: 'sprinting', time: fast.clock.nextSimTimestamp }).sound?.event,
    ).toBe(fastEvent);
  });

  it('admits brushing sound and positioned hearing together during actual player movement even without output', () => {
    const world = new World();
    const entities = new BlockEntities(registry);
    for (let z = 0; z < 6; z++) {
      for (let x = 0; x < 6; x++) {
        world.setBlock(x, 0, z, registry.blockIds.get('stone')!);
        for (let y = 1; y < 5; y++) {
          world.setBlock(x, y, z, registry.blockIds.get('leaves')!);
        }
      }
    }
    const session = createSession({
      registry,
      actorFigureFiles: stackActorFigureFiles(registry),
      world,
      entities,
      isSolid: worldSolid(world, registry, entities),
      isOpaque: worldOpaque(world, registry, entities),
      scale,
      seed: 1,
      start: 43_200,
      spawn: [2.5, 1, 4.5],
      ready: () => true,
      controls: {
        active: () => true,
        intent: () => ({ ...IDLE, forward: 1, walk: true }),
        yaw: () => 0,
        pitch: () => 0,
        walking: () => true,
        descending: () => false,
      },
      audio: { play: () => false },
      notice: () => undefined,
      onRead: () => {
        throw new Error('Unexpected reading in vegetation fixture');
      },
    });
    session.sim.paused = false;
    const reader = session.sim.events.reader();
    for (let frame = 0; frame < 30; frame++) {
      session.frame(1 / 60);
    }
    expect(session.body.pos[2]).toBeLessThan(4.5);
    const events = reader
      .read()
      .filter((event) => (event.kind === 'sound' || event.kind === 'noise') && event.event === 'foliage_rustle');
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((event) => event.kind === 'sound').map((event) => event.position)).toEqual(
      events.filter((event) => event.kind === 'noise').map((event) => event.position),
    );
    const leaves = registry.blocks[registry.blockIds.get('leaves')!]!;
    const rustleEvent = leaves.rustle?.gentle;
    expect(rustleEvent).toBeDefined();
    const rustleSound = registry.sounds.get(rustleEvent!);
    expect(rustleSound?.noise.enabled).toBe(true);
    expect(session.playerAudio.vocalNoise?.radiusMetres).toBe(rustleSound?.noise.radiusMetres);
  });

  it('admits paired rustle and hearing when a real session falls vertically through leaves without horizontal input', () => {
    const { body, events } = verticalBrushSession(8);
    expect([body.pos[0], body.pos[2]]).toEqual([2.5, 2.5]);
    expect(body.pos[1]).toBeLessThan(4);
    const sounds = events.filter((event) => event.kind === 'sound');
    expect(sounds.length).toBeGreaterThan(0);
    expect(sounds.map((event) => event.position)).toEqual(
      events.filter((event) => event.kind === 'noise').map((event) => event.position),
    );
  });

  it('keeps stationary foliage overlap silent both at the true resting height and during contact-skin correction', () => {
    // A stone floor tops out at y=1; physics leaves a 0.0001-block contact skin.
    // The second case also catches a naive 3D predicate mistaking that correction for brushing.
    for (const spawnY of [1.0001, 1]) {
      const { body, events } = verticalBrushSession(spawnY);
      expect([body.pos[0], body.pos[2]]).toEqual([2.5, 2.5]);
      expect(body.pos[1]).toBeCloseTo(1.0001, 8);
      expect(events, `stationary spawn y=${spawnY}`).toHaveLength(0);
    }
  });

  it('resolves every tree and litter surface to a registered player and shambler footstep sound', () => {
    const { trees, leafLitter } = sitePalette(registry);
    const families = {
      player: [...registry.senses.values()][0]!.footsteps.family,
      shambler: [...registry.actors.values()].find((actor) => actor.footstepSound)!.footstepSound!,
    };
    for (const id of [trees.trunk, trees.branch, trees.leaves, leafLitter]) {
      const block = registry.blocks[id]!;
      for (const [agent, family] of Object.entries(families)) {
        const event = footstepEventForBlock(registry, block, family);
        expect(event, `${agent} footstep on ${block.id}`).toBeDefined();
        expect(registry.sounds.has(event!), `${agent} footstep sound ${event} on ${block.id}`).toBe(true);
      }
    }
  });

  it('keeps the seeded forest-density field smooth and seed-dependent', () => {
    const heading = [-0.9, 0.44];
    const unit = heading.map((value) => value / Math.hypot(...heading));
    const { gain, wavelengthMetres } = siteGenerationOf(registry).vegetation.forestDensityField;
    const sampleStepMetres = 0.5;
    const stretchHalfExtentMetres = wavelengthMetres / 8;
    const sampleCount = Math.floor((2 * stretchHalfExtentMetres) / sampleStepMetres) + 1;
    const samples = Array.from({ length: sampleCount }, (_, index) => {
      const distance = -stretchHalfExtentMetres + index * sampleStepMetres;
      return forestDensityAt(registry, 1, unit[0]! * distance, unit[1]! * distance);
    });
    const maxStepDifference = (3 * gain * sampleStepMetres) / wavelengthMetres;

    expect(samples.every((sampledDensity) => sampledDensity >= 0 && sampledDensity <= 1)).toBe(true);
    for (let index = 1; index < samples.length; index += 1) {
      expect(Math.abs(samples[index]! - samples[index - 1]!)).toBeLessThanOrEqual(maxStepDifference);
    }

    const x = unit[0]! * 96;
    const z = unit[1]! * 96;
    const density = forestDensityAt(registry, 1, x, z);
    expect(density).toBeGreaterThanOrEqual(0);
    expect(density).toBeLessThanOrEqual(1);
    expect(forestDensityAt(registry, 2, x, z)).not.toBe(density);
  });

  it('indexes exclusive litter borders and preserves clipped voxel writes across negative and positive columns', () => {
    const trees = [
      placeTree(
        'broadleaf',
        [-32, 1, -32],
        [{ min: [0, 0, 0], max: [32, 1, 32], block: registry.blockIds.get('leaves')! }],
      ),
      placeTree(
        'young',
        [-1, 1, -1],
        [{ min: [0, 0, 0], max: [2, 2, 2], block: registry.blockIds.get('tree_trunk')! }],
      ),
    ];
    const index = new TreeIndex(trees);
    for (const [x, z] of [
      [-33, -32],
      [-32, -32],
      [-1, -1],
      [0, 0],
      [1, 1],
      [32, 32],
    ]) {
      expect(leafLitterAt(index.at(x!, z!), x!, z!)).toBe(leafLitterAt(trees, x!, z!));
    }
    expect(leafLitterAt(index.at(-1, -16), -1, -16)).toBe(true);
    expect(leafLitterAt(index.at(0, -16), 0, -16)).toBe(false);
    for (const [cx, cz] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ]) {
      const full = new Chunk(cx!, 0, cz!);
      const local = new Chunk(cx!, 0, cz!);
      stampTrees(full, trees);
      stampTrees(local, index.inColumn(cx!, cz!));
      expect(local.toArray()).toEqual(full.toArray());
    }
    expect(index.at(1000, 1000)).toHaveLength(0);
  });

  it('makes denser forests a seeded superset without moving existing trees or narrowing the extent', () => {
    const sparse = new Forest(1, registry, scale, 0.25);
    const dense = new Forest(1, registry, scale, 0.75);
    const placements = new Set(dense.trees.map((tree) => `${tree.shape}:${tree.origin}`));
    expect(sparse.trees.length).toBeGreaterThan(0);
    expect(dense.trees.length).toBeGreaterThan(sparse.trees.length);
    expect(sparse.trees.every((tree) => placements.has(`${tree.shape}:${tree.origin}`))).toBe(true);
    expect(dense.bounds).toEqual(sparse.bounds);
    expect(dense.trees.some((tree) => rectsOverlap(tree.bounds, { x0: -8, z0: -8, x1: 8, z1: 8 }))).toBe(false);
  });
});
