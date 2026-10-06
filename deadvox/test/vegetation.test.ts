import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import { foliageRustle, initialRustleClock } from '../src/core/foliageRustle.ts';
import { footstepEventForBlock, shamblerFootstepEventForBlock } from '../src/core/footsteps.ts';
import { Forest } from '../src/core/forest.ts';
import { HAMLET, Hamlet } from '../src/core/hamlet.ts';
import { PlayerCombat } from '../src/core/playerCombat.ts';
import { raycast } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { grow } from '../src/core/site.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';
import {
  forestDensityAt,
  leafLitterAt,
  placeTree,
  rectsOverlap,
  stampTrees,
  TREE_MIX,
  TreeIndex,
} from '../src/core/vegetation.ts';
import { World } from '../src/core/world.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { perceivePlayer, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const { registry, issues } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);
const scale = makeScale(0.5);
const soundTuning = { hearingRangeScale: 0.5, gain: 0.5, cutoffHz: 1200, clearGain: 1, clearCutoffHz: 18_000 };
const senseTuning = {
  id: 'fixture_player',
  crouch: { speedMetresPerSecond: 0.8, hearingRangeScale: 0.5, sightRangeScale: 0.5, eyeDropMetres: 0.6 },
  wall: soundTuning,
  light: { playerDaySightScale: 0, lureRangeScale: 0, throwMaxDistanceMetres: 8, throwChargeSeconds: 1.25 },
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
    expect(issues).toEqual([]);
    const world = new World();
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    const entities = new BlockEntities(registry);
    const solid = worldSolid(world, registry, entities);
    const opaque = worldOpaque(world, registry, entities);
    const sense = () =>
      perceivePlayer({
        zombie: registry.zombies.get('shambler')!,
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: { pos: [10, 2, 0], facing: [-1, 0, 0], movement: 'still', lit: false, lightSeenFrom: 40 },
        hour: 12,
        blockSize: 0.5,
        isSolid: opaque,
        tuning: senseTuning,
      });
    expect(sense()).toBe(true);
    for (const name of ['tree_trunk', 'tree_branch', 'leaves', 'hedge', 'leaf_litter']) {
      const id = registry.blockIds.get(name)!;
      const blocksMovement = name !== 'leaves' && name !== 'hedge';
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
    };
    const hits: number[] = [];
    const system = new ZombieSystem({
      isSolid: (x, y, z) => y === 0 || movement(x, y, z),
      isOpaque: opaque,
      blockSize: 0.5,
      physics: physicsFor(scale),
      jumpSpeed: PLAYER.jump,
      tuning: senseTuning,
      player: () => player,
      hour: () => 12,
      hurtPlayer: () => undefined,
      onMeleeResult: (result) => hits.push(result.damage),
    });
    const playerCombat = new PlayerCombat(system);
    const id = system.add(registry.zombies.get('shambler')!, [0.5, 1, 8.5], [0, 0, -1]);
    system.tick(1 / 20);
    const zombie = system.store.get(id)!;
    expect(zombie.mode).not.toBe('chase');
    system.setFrozen(true);
    const { center } = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, 0.5)).head.find(
      (box) => box.bone === 'head',
    )!;
    const origin: [number, number, number] = [center[0], center[1], 0.5];
    const direction: [number, number, number] = [0, 0, 1];
    const weapon = { damage: 1, reach: 6, cooldown: 0.8 };
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

  it('rustles on entry and cooldown only while moving, with faster content cadence', () => {
    const world = new World();
    world.setBlock(2, 2, 2, registry.blockIds.get('leaves')!);
    world.setBlock(3, 2, 2, registry.blockIds.get('hedge')!);
    const body = {
      pos: [2.5, 2, 2.5] as [number, number, number],
      vel: [0, 0, 0] as [number, number, number],
      halfWidth: 0.2,
      height: 0.8,
      onGround: false,
    };
    const sample = { body, world, registry, gait: 'walking' as const, moving: true, time: 0 };
    const entry = foliageRustle(initialRustleClock(), sample);
    expect(entry.sound?.event).toBe('foliage_rustle');
    expect(foliageRustle(entry.clock, { ...sample, time: 0.2 }).sound).toBeUndefined();
    expect(foliageRustle(entry.clock, { ...sample, time: 0.5, moving: false }).sound).toBeUndefined();
    expect(foliageRustle(entry.clock, { ...sample, time: 0.5 }).sound?.event).toBe('foliage_rustle');
    body.pos[0] = 3.5;
    const fast = foliageRustle(entry.clock, { ...sample, gait: 'sprinting', time: 0.3 });
    expect(fast.sound?.event).toBe('foliage_rustle_fast');
    expect(fast.clock.nextTime - 0.3).toBeLessThan(entry.clock.nextTime);
    expect(foliageRustle(fast.clock, { ...sample, gait: 'sprinting', time: 0.5 }).sound?.event).toBe(
      'foliage_rustle_fast',
    );
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
    expect(session.playerAudio.vocalNoise?.radiusMetres).toBe(4);
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

  it('maps wood and foliage footsteps explicitly for both player and shambler', () => {
    for (const name of ['tree_trunk', 'tree_branch']) {
      expect(footstepEventForBlock(name)).toBe('footstep_wood');
      expect(shamblerFootstepEventForBlock(name)).toBe('shambler_step_wood');
    }
    for (const name of ['leaves', 'hedge', 'leaf_litter']) {
      expect(footstepEventForBlock(name)).toBe('footstep_leaves');
      expect(shamblerFootstepEventForBlock(name)).toBe('shambler_step_leaves');
    }
  });

  it('keeps entire hamlet canopies and hedges off lots, road frontage/entrances, spawn and range', () => {
    const hamlet = new Hamlet(1, registry, scale);
    expect(new Set(hamlet.trees.map((tree) => tree.shape))).toEqual(new Set(TREE_MIX));
    expect(hamlet.hedges.length).toBeGreaterThan(0);
    const required = [
      grow(hamlet.road, HAMLET.gap),
      grow(hamlet.range.rect, 4),
      ...hamlet.lots.map((lot) => grow(lot.rect, 2)),
    ];
    for (const tree of hamlet.trees) {
      expect(
        required.some((rect) => rectsOverlap(rect, tree.bounds)),
        `${tree.shape} at ${tree.origin}`,
      ).toBe(false);
    }
    for (const box of hamlet.hedges) {
      const footprint = { x0: box.min[0], z0: box.min[2], x1: box.max[0], z1: box.max[2] };
      expect(required.some((rect) => rectsOverlap(rect, footprint))).toBe(false);
      expect(hamlet.trees.some((tree) => rectsOverlap(tree.bounds, footprint))).toBe(false);
    }
    const broadleaf = hamlet.trees.find((tree) => tree.shape === 'broadleaf')!;
    expect(hamlet.surface.top!(broadleaf.origin[0], broadleaf.origin[2])).toBe(registry.blockIds.get('leaf_litter'));
    const [x, , z] = hamlet.spawn.pos;
    expect(hamlet.surface.top!(Math.floor(x / 0.5), Math.floor(z / 0.5))).toBe(registry.blockIds.get('asphalt'));
  });

  it('freezes a seeded smooth field with a 0.75 patch beyond the clearing on the full route', () => {
    const heading = [-0.9, 0.44];
    const unit = heading.map((value) => value / Math.hypot(...heading));
    expect(forestDensityAt(1, unit[0]! * 16, unit[1]! * 16)).toBe(0.75);
    expect(forestDensityAt(1, unit[0]! * 96, unit[1]! * 96)).toBeLessThan(0.65);
    expect(forestDensityAt(2, unit[0]! * 96, unit[1]! * 96)).not.toBe(forestDensityAt(1, unit[0]! * 96, unit[1]! * 96));
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
    expect(dense.trees.length).toBeGreaterThan(sparse.trees.length * 2);
    expect(sparse.trees.every((tree) => placements.has(`${tree.shape}:${tree.origin}`))).toBe(true);
    expect(dense.bounds).toEqual(sparse.bounds);
    expect(dense.bounds).toEqual({ x0: -768, z0: -768, x1: 768, z1: 768 });
    expect(dense.trees.some((tree) => rectsOverlap(tree.bounds, { x0: -8, z0: -8, x1: 8, z1: 8 }))).toBe(false);
  });
});
