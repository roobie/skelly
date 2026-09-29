// Tests for src/render/mobActors.ts. Pure/three-without-a-GPU pieces only — no rendered pixels (no GPU
// here), so these check the maths and the state machine, not what anything looks like. See the module's
// own report for what to look at in a real browser.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateValid, realize } from '@mobgen/core/generate.ts';
import { allocateBoneTransforms, boneTransformsInto, indexBonesByParent } from '@mobgen/core/pose.ts';
import { ATTACK_CLIPS } from '@mobgen/mob/attack.ts';
import { corners, footRestExtents, INITIAL_CLOCK, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { initialShamblerFootstepClock } from '../src/core/footsteps.ts';
import { Rng } from '../src/core/random.ts';
import type { Zombie, ZombieMode } from '../src/core/zombies.ts';
import {
  advanceGaitFromMovement,
  attackJustStarted,
  attackStartTime,
  fallDirectionAwayFromPlayer,
  flinchSideForId,
  MobActorMeshes,
  variantIndexForId,
} from '../src/render/mobActors.ts';

const LUNGE_GRAB_HIT_TIME = ATTACK_CLIPS.LUNGE_GRAB!.hitTime;

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;

/** A minimal, valid Zombie — same shape ZombieSystem.add() builds (src/core/zombies.ts), constructed
 * directly so these tests don't need a full ZombieSystem (physics/senses/etc, irrelevant here). */
const makeZombie = (position: Vec3, facing: Vec3 = [0, 0, -1], severed: string[] = []): Zombie => ({
  type: SHAMBLER,
  body: { pos: [...position], vel: [0, 0, 0], halfWidth: 0.28 / 0.5, height: 1.7 / 0.5, onGround: true },
  facing: [...facing],
  home: [...position],
  mode: 'idle' as ZombieMode,
  investigationTier: undefined,
  behaviorRng: Rng.stream(0, 'test-zombie'),
  soundRng: Rng.stream(0, 'test-zombie-sound'),
  dismemberRng: Rng.stream(0, 'test-zombie-dismember'),
  idleSoundTimer: 8,
  modeTimer: 0,
  searchAnchor: undefined,
  searchTimer: 0,
  searchStrolling: false,
  searchHeading: [...facing],
  strollHeading: [...facing],
  horizontalSpeed: 0,
  bodyLookTarget: 0,
  headYaw: 0,
  headYawTarget: 0,
  lookTimer: 0,
  swayValue: 0,
  swayStart: 0,
  swayTarget: 0,
  swayElapsed: 0,
  swayDuration: 0,
  lurchValue: 1,
  lurchStart: 1,
  lurchTarget: 1,
  lurchElapsed: 0,
  lurchDuration: 0,
  stumbleFactor: 1,
  stumbleElapsed: 0,
  stumbleDuration: 0,
  renderPrevious: { pos: [...position], facing: [...facing], headYaw: 0, gaitPhase: 0 },
  health: SHAMBLER.health,
  attackWait: 0,
  attackWindup: 0,
  gaitPhase: 0,
  footstepClock: initialShamblerFootstepClock(SHAMBLER.stepLength),
  wanderClock: 0,
  severed,
});

describe('facing convention', () => {
  it('a zombie facing +X has its figure forward (local -Z) along +X in world, matching ZombieMeshes', () => {
    // Same formula both this renderer and ZombieMeshes use (src/render/zombies.ts's renderPose).
    const facing: Vec3 = [1, 0, 0];
    const yaw = Math.atan2(-facing[0], -facing[2]);
    // Three.js/mobgen convention: rotating the local forward (0,0,-1) about Y by `yaw` gives
    // (-sin(yaw), 0, -cos(yaw)) — see mobgen's stress.ts for the same derivation.
    const worldForward: Vec3 = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    expect(worldForward[0]).toBeCloseTo(1, 9);
    expect(worldForward[1]).toBeCloseTo(0, 9);
    expect(worldForward[2]).toBeCloseTo(0, 9);
  });
});

describe('feet at body.pos.y (mobgen pose convention)', () => {
  it('a standing pose puts the lowest foot corner at local y = 0, so placing the rig at body.pos.y needs no extra offset', () => {
    const shamblerTemplate = TEMPLATES.find((t) => t.name === 'shambler')!;
    const found = generateValid(shamblerTemplate, 1)!;
    const { body, voxels } = realize(found.genome);
    const extents = footRestExtents(body.bones, voxels);
    const walkActor = {
      bones: body.bones,
      extents,
      params: found.genome.params as HumanoidParams,
      seed: found.genome.seed,
    };
    const pose = walkPose(walkActor, INITIAL_CLOCK, 0); // speed 0: the standing pose

    const parentIndex = indexBonesByParent(body.bones);
    const scratch = allocateBoneTransforms(body.bones.length);
    boneTransformsInto(body.bones, pose, parentIndex, scratch);

    let minY = Number.POSITIVE_INFINITY;
    for (const [boneId, extent] of extents) {
      const boneIndex = body.bones.findIndex((b) => b.id === boneId);
      const t = scratch[boneIndex]!;
      for (const c of corners(extent)) {
        const y = t.r[3] * c[0] + t.r[4] * c[1] + t.r[5] * c[2] + t.t[1];
        minY = Math.min(minY, y);
      }
    }
    // Not toBeCloseTo(0, ...): groundOffset deliberately smooth-mins across tied corners (mobgen's
    // GROUND_SMOOTHING = 0.006 m) rather than a hard min, so a flat sole's several tied-lowest corners
    // undershoot true-zero by up to ~0.006 * ln(#tied corners) — a few mm to ~1.25 cm here, by design
    // (see mob/gait.ts's own smoothMinAll comment), not a bug to chase to the millimetre.
    expect(Math.abs(minY)).toBeLessThan(0.02);
  });
});

describe('attackJustStarted', () => {
  it('is true only when attackWait rises versus last frame (a fresh attack windup starting), never on a fall', () => {
    expect(attackJustStarted(1.5, 0)).toBe(true); // windup just started (cooldown jumps up from 0)
    expect(attackJustStarted(1.2, 1.5)).toBe(false); // cooling down
    expect(attackJustStarted(0, 0)).toBe(false); // idle, unchanged
  });
});

describe('attackStartTime', () => {
  it('starts the clip already `windup` seconds in, so the clip hitTime lines up with the sim hit', () => {
    expect(attackStartTime(0.3)).toBeCloseTo(LUNGE_GRAB_HIT_TIME - 0.3, 9);
  });

  it('clamps to 0 for a windup at or beyond the clip hitTime, instead of a negative start', () => {
    expect(attackStartTime(LUNGE_GRAB_HIT_TIME)).toBe(0);
    expect(attackStartTime(LUNGE_GRAB_HIT_TIME + 1)).toBe(0);
  });
});

describe('advanceGaitFromMovement', () => {
  const basis = {
    params: { footLift: 0.04 } as HumanoidParams,
    geomL: { legLen: 0.9, hipY: 0.9, heelLen: 0.1, toeLen: 0.15, ankleRestY: 0.1 },
    seed: 1,
  };

  it('advances the clock by the distance travelled and updates the smoothed/quantized speed', () => {
    const start = { clock: { stepIndex: 0, progress: 0 }, smoothedSpeed: 0, quantizedSpeed: 0 };
    const next = advanceGaitFromMovement(start, 0.1, 1 / 60, basis);
    expect(next.clock.progress > 0 || next.clock.stepIndex > 0).toBe(true);
    expect(next.smoothedSpeed).toBeGreaterThan(0);
  });

  it('does not advance the clock (or the speed filter) on a teleport-sized jump', () => {
    const start = { clock: { stepIndex: 2, progress: 0.4 }, smoothedSpeed: 1.2, quantizedSpeed: 1.2 };
    const next = advanceGaitFromMovement(start, 5, 1 / 60, basis);
    expect(next).toEqual(start);
  });
});

describe('variantIndexForId', () => {
  it('is deterministic and always in [0, poolSize)', () => {
    for (const id of [1, 2, 3, 17, 1000, 999_999]) {
      const a = variantIndexForId(id, 12);
      const b = variantIndexForId(id, 12);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(12);
    }
  });
});

describe('MobActorMeshes', () => {
  it('generates its variant pool and syncs without throwing', () => {
    const renderer = new MobActorMeshes(0.5, 4, { poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      store.add(makeZombie([0, 0, 0]));
      store.add(makeZombie([2, 0, 2]));
      expect(() => renderer.sync(store, 1 / 60, 1)).not.toThrow();
      expect(() => renderer.sync(store, 1 / 60, 1)).not.toThrow();
    } finally {
      renderer.dispose();
    }
  });

  it('recycles a slot once its zombie is removed from the store', () => {
    const renderer = new MobActorMeshes(0.5, 1, { poolSize: 1 }); // exactly one slot, total
    try {
      const store = new MapEntityStore<Zombie>();
      const firstId = store.add(makeZombie([0, 0, 0]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(firstId)).toBe(true);

      store.remove(firstId);
      renderer.sync(store, 1 / 60, 1); // this frame's own prune pass frees the slot
      expect(renderer.isTracked(firstId)).toBe(false);

      const secondId = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1); // the freed slot is available immediately
      expect(renderer.isTracked(secondId)).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it("doesn't render a zombie beyond its variant's capacity (documented overflow behaviour)", () => {
    const renderer = new MobActorMeshes(0.5, 1, { poolSize: 1 }); // capacity 1, so a 2nd zombie always overflows
    try {
      const store = new MapEntityStore<Zombie>();
      const first = store.add(makeZombie([0, 0, 0]));
      const second = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1);
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(first)).toBe(true);
      expect(renderer.isTracked(second)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });
});

describe('flinchSideForId', () => {
  it('is deterministic and always in [-1, 1)', () => {
    for (const id of [1, 2, 3, 17, 1000, 999_999]) {
      const a = flinchSideForId(id);
      const b = flinchSideForId(id);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThan(1);
    }
  });
});

describe('fallDirectionAwayFromPlayer', () => {
  it('falls backward when the player is ahead (in the facing direction) — away from them', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], [0, 0, -3])).toBe(-1);
  });

  it('falls forward when the player is behind — away from them', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], [0, 0, 3])).toBe(1);
  });

  it('defaults to backward when no player position is available', () => {
    expect(fallDirectionAwayFromPlayer([0, 0, -1], [0, 0, 0], undefined)).toBe(-1);
  });
});

describe('MobActorMeshes reactions', () => {
  it('starts a flinch only when health drops, not on an unrelated frame', () => {
    const renderer = new MobActorMeshes(0.5, 4, { poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1); // establishes prevHealth from this zombie's starting health
      expect(renderer.isFlinching(id)).toBe(false);

      renderer.sync(store, 1 / 60, 1); // no health change this frame
      expect(renderer.isFlinching(id)).toBe(false);

      zombie.health -= 8;
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isFlinching(id)).toBe(true);

      renderer.sync(store, 10, 1); // well past HIT_FLINCH's 0.35 s duration
      expect(renderer.isFlinching(id)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('keeps a corpse (its slot) until it has lain and sunk, then frees it — unlike a plain vanish', () => {
    const renderer = new MobActorMeshes(0.5, 2, { poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      store.remove(id);
      renderer.zombieDied(id, zombie);
      expect(renderer.isTracked(id)).toBe(true); // still drawn, as a corpse

      renderer.sync(store, 5, 1); // well into lying, nowhere near the end of the lifetime
      expect(renderer.isTracked(id)).toBe(true);

      renderer.sync(store, 10, 1); // fall + lie + sink is under 11 s total — this pushes well past it
      expect(renderer.isTracked(id)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('frees a vanished-without-dying zombie immediately (despawn/unload), unlike a death', () => {
    const renderer = new MobActorMeshes(0.5, 2, { poolSize: 1 });
    try {
      const store = new MapEntityStore<Zombie>();
      const id = store.add(makeZombie([0, 0, 0]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(id)).toBe(true);

      store.remove(id); // no zombieDied call — a plain vanish, not a death
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(id)).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('caps corpses, evicting the oldest first once the cap is exceeded', () => {
    const renderer = new MobActorMeshes(0.5, 20, { poolSize: 1 }); // one shared variant, room for every corpse
    try {
      const store = new MapEntityStore<Zombie>();
      const ids: number[] = [];
      for (let i = 0; i < 17; i++) {
        const zombie = makeZombie([i, 0, 0]);
        const id = store.add(zombie);
        renderer.sync(store, 1 / 60, 1);
        store.remove(id);
        renderer.zombieDied(id, zombie);
        ids.push(id);
      }
      expect(renderer.isTracked(ids[0]!)).toBe(false); // the oldest corpse, evicted by the 17th death
      for (let i = 1; i < 17; i++) {
        expect(renderer.isTracked(ids[i]!)).toBe(true);
      }
    } finally {
      renderer.dispose();
    }
  });
});

describe('MobActorMeshes dismemberment', () => {
  it("hides a severed bone's whole subtree (zero matrices), leaving the other arm alone", () => {
    const renderer = new MobActorMeshes(0.5, 4, { poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      zombie.severed.push('upperArm.L');
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);

      expect(renderer.isBoneHidden(id, 'upperArm.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'forearm.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(true);
      expect(renderer.isBoneHidden(id, 'upperArm.R')).toBe(false);
      expect(renderer.isBoneHidden(id, 'forearm.R')).toBe(false);
      expect(renderer.isBoneHidden(id, 'pelvis')).toBe(false);
    } finally {
      renderer.dispose();
    }
  });

  it('re-derives hidden bones from zombie.severed every sync (source of truth, e.g. after a save/load)', () => {
    const renderer = new MobActorMeshes(0.5, 4, { poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(false);

      zombie.severed.push('hand.L'); // simulates a fresh severing (or a restored save) between syncs
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isBoneHidden(id, 'hand.L')).toBe(true);
    } finally {
      renderer.dispose();
    }
  });

  it('allocates a debris slot on zombieSevered and frees it after its lifetime', () => {
    const renderer = new MobActorMeshes(0.5, 4, { poolSize: 2 });
    try {
      const store = new MapEntityStore<Zombie>();
      const zombie = makeZombie([0, 0, 0]);
      const id = store.add(zombie);
      renderer.sync(store, 1 / 60, 1); // establishes render state (lastPos) to spawn debris from

      renderer.zombieSevered(id, 'hand.L');
      expect(renderer.debrisCountFor(id)).toBe(1);

      // A single giant step only gets it to "grounded this frame" (elapsed already exceeds the flight
      // safety net, so it settles immediately rather than bouncing) — freeing is checked against elapsed
      // *at the top* of the next call, so a second big step is what actually clears the lie + sink budget.
      renderer.sync(store, 20, 1);
      renderer.sync(store, 20, 1);
      expect(renderer.debrisCountFor(id)).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('does nothing for zombieSevered on an untracked id (over capacity)', () => {
    const renderer = new MobActorMeshes(0.5, 1, { poolSize: 1 }); // capacity 1: a 2nd zombie always overflows
    try {
      const store = new MapEntityStore<Zombie>();
      store.add(makeZombie([0, 0, 0]));
      const second = store.add(makeZombie([1, 0, 1]));
      renderer.sync(store, 1 / 60, 1);
      expect(renderer.isTracked(second)).toBe(false);

      expect(() => renderer.zombieSevered(second, 'hand.L')).not.toThrow();
      expect(renderer.debrisCountFor(second)).toBe(0);
    } finally {
      renderer.dispose();
    }
  });

  it('debris counts toward the corpse cap, evicting the oldest dead thing first', () => {
    const renderer = new MobActorMeshes(0.5, 20, { poolSize: 1 }); // one shared variant, room for 17 dead things
    try {
      const store = new MapEntityStore<Zombie>();
      const ids: number[] = [];
      for (let i = 0; i < 17; i++) {
        const zombie = makeZombie([i, 0, 0]);
        const id = store.add(zombie);
        renderer.sync(store, 1 / 60, 1);
        renderer.zombieSevered(id, 'hand.L'); // debris, not a corpse — still counts toward MAX_CORPSES
        store.remove(id);
        renderer.sync(store, 1 / 60, 1); // prunes the (now-vanished) live entry; the debris itself survives
        ids.push(id);
      }
      // The very first debris was evicted once the 17th arrived (MAX_CORPSES is 16).
      expect(renderer.debrisCountFor(ids[0]!)).toBe(0);
      for (let i = 1; i < 17; i++) {
        expect(renderer.debrisCountFor(ids[i]!)).toBe(1);
      }
    } finally {
      renderer.dispose();
    }
  });
});
