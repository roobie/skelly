import { describe, expect, it } from 'vitest';
import type { ProjectileVolleyRequest } from '../src/core/castRules.ts';
import {
  advanceCastProjectile,
  advanceCastVolley,
  CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS,
  type CastProjectileState,
  castVolley,
  castVolleyDone,
  restoredCastFlight,
  sphereExitDistance,
  validCastProjectileState,
  validCastVolleyState,
} from '../src/core/castVolleys.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { raycast, type SolidAt } from '../src/core/raycast.ts';
import { CAST_RULE_LIMITS } from '../src/core/schema/rules.ts';
import { simRate, simSeconds } from '../src/core/time.ts';

const BLOCK_SIZE = 0.5;
const STEP = 0.05;

const request = (overrides: Partial<ProjectileVolleyRequest> = {}): ProjectileVolleyRequest => ({
  verb: 'projectileVolley',
  casterId: 'player',
  abilityId: 'fixture_bolt',
  sourceItemUid: 1,
  hand: 'right',
  abilityLevel: 0,
  origin: { x: 0.5, y: 0.5, z: 0.5 },
  aim: { x: 1, y: 0, z: 0 },
  count: 3,
  intervalSimSeconds: simSeconds(0.25),
  speedMetresPerSimSecond: simRate(10),
  rangeMetres: 100,
  damage: 1,
  damageKind: 'fixture_arcane',
  ...overrides,
});

const shot = (overrides: Partial<CastProjectileState> = {}): CastProjectileState => ({
  casterId: 'player',
  abilityId: 'fixture_bolt',
  damageKind: 'fixture_arcane',
  damage: 1,
  pos: [0.5, 0.5, 0.5],
  direction: [1, 0, 0],
  speedMetresPerSimSecond: 10,
  rangeMetres: 100,
  remainingMetres: 100,
  ...overrides,
});

const terrain =
  (isSolid: SolidAt) =>
  (origin: Vec3, direction: Vec3, distance: number): { distance: number } | undefined =>
    raycast(origin, direction, distance, isSolid);

const open = terrain(() => false);

/** Flies a shot step by step until it ends, with no bound nearer than the shot's own range. */
const flyOut = (projectile: CastProjectileState, cast: ReturnType<typeof terrain>) => {
  for (;;) {
    const end = advanceCastProjectile(
      projectile,
      { dt: STEP, blockSize: BLOCK_SIZE, boundBlocks: Number.POSITIVE_INFINITY },
      cast,
    );
    if (end) {
      return end;
    }
  }
};

describe('cast volleys', () => {
  it('launch count shots an interval apart, each flying only the part of the step after its launch', () => {
    const delay = 0.02;
    const volley = castVolley(request(), delay);
    const launches: { at: number; flown: number }[] = [];
    for (let step = 1; !castVolleyDone(volley); step += 1) {
      for (const { flownSimSeconds } of advanceCastVolley(volley, STEP)) {
        launches.push({ at: step * STEP - flownSimSeconds, flown: flownSimSeconds });
      }
    }
    expect(launches.map(({ at }) => at)).toEqual([delay, delay + 0.25, delay + 0.5].map((at) => expect.closeTo(at, 9)));
    expect(launches.every(({ flown }) => flown >= 0 && flown < STEP)).toBe(true);
    const first = castVolley(request({ count: 1 }), delay);
    const [{ projectile, flownSimSeconds }] = advanceCastVolley(first, STEP) as [
      ReturnType<typeof advanceCastVolley>[number],
    ];
    advanceCastProjectile(
      projectile,
      { dt: flownSimSeconds, blockSize: BLOCK_SIZE, boundBlocks: Number.POSITIVE_INFINITY },
      open,
    );
    expect(projectile.pos[0] - 0.5).toBeCloseTo((10 * (STEP - delay)) / BLOCK_SIZE, 9);
  });

  it('every launch leaves from the ray captured at release', () => {
    const volley = castVolley(request({ intervalSimSeconds: simSeconds(0) }), 0);
    const launched = advanceCastVolley(volley, STEP).map(({ projectile }) => projectile);
    expect(launched).toHaveLength(3);
    for (const projectile of launched) {
      expect([projectile.pos, projectile.direction]).toEqual([
        [0.5, 0.5, 0.5],
        [1, 0, 0],
      ]);
    }
  });

  it('a shot far faster than a block per step stops at a one-block wall instead of passing it', () => {
    const wall = 40;
    const projectile = shot({ speedMetresPerSimSecond: 2000, rangeMetres: 1000, remainingMetres: 1000 });
    expect(2000 * STEP).toBeGreaterThan(wall * BLOCK_SIZE);
    const end = flyOut(
      projectile,
      terrain((x) => x === wall),
    );
    expect(end.kind).toBe('hit');
    expect(projectile.pos[0]).toBeCloseTo(wall, 9);
  });

  it('a shot starting inside a wall stops where it is', () => {
    const projectile = shot();
    const end = flyOut(
      projectile,
      terrain(() => true),
    );
    expect(end.kind).toBe('hit');
    expect(projectile.pos).toEqual([0.5, 0.5, 0.5]);
  });

  it('a shot ends at its range, measured in metres on a non-unit block scale', () => {
    const projectile = shot({ rangeMetres: 3, remainingMetres: 3 });
    expect(flyOut(projectile, open).kind).toBe('spent');
    expect(projectile.pos[0] - 0.5).toBeCloseTo(3 / BLOCK_SIZE, 9);
  });

  it('a shot ends where it leaves the simulated bound, however fast or far it could go', () => {
    const projectile = shot({ speedMetresPerSimSecond: Number.MAX_VALUE, rangeMetres: Number.MAX_VALUE });
    projectile.remainingMetres = Number.MAX_VALUE;
    const bound = sphereExitDistance(projectile.pos, projectile.direction, [0, 0.5, 0.5], 8);
    let casts = 0;
    const end = advanceCastProjectile(projectile, { dt: STEP, blockSize: BLOCK_SIZE, boundBlocks: bound }, (...ray) => {
      casts += 1;
      return open(...ray);
    });
    expect(end?.kind).toBe('spent');
    expect(casts).toBe(1);
    expect(projectile.pos[0]).toBeCloseTo(8, 9);
  });
});

describe('restored cast state', () => {
  const launchedOnce = (): ReturnType<typeof castVolley> => {
    const volley = castVolley(request(), 0);
    advanceCastVolley(volley, STEP);
    return volley;
  };

  it('accepts what a commit and its flight leave', () => {
    expect(validCastVolleyState(castVolley(request(), CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS))).toBe(true);
    expect(validCastVolleyState(launchedOnce())).toBe(true);
    const projectile = shot();
    advanceCastProjectile(projectile, { dt: STEP, blockSize: BLOCK_SIZE, boundBlocks: Number.POSITIVE_INFINITY }, open);
    expect(validCastProjectileState(projectile)).toBe(true);
  });

  it.each([
    ['more shots than a cast may carry', { request: request({ count: CAST_RULE_LIMITS.projectiles + 1 }) }],
    ['a finished volley', { launched: 3 }],
    ['a negative countdown', { nextLaunchInSimSeconds: -STEP }],
    ['a countdown past the interval', { nextLaunchInSimSeconds: 0.5 }],
    ['an aim that is not a unit', { request: request({ aim: { x: 2, y: 0, z: 0 } }) }],
    ['a non-finite origin', { request: request({ origin: { x: Number.NaN, y: 0, z: 0 } }) }],
    ['a zero speed', { request: request({ speedMetresPerSimSecond: simRate(0) }) }],
  ])('rejects a volley with %s', (_case, overrides) => {
    expect(validCastVolleyState({ ...launchedOnce(), ...overrides })).toBe(false);
  });

  it('rejects a first launch delay no commit could leave', () => {
    const volley = castVolley(request(), 0);
    expect(validCastVolleyState({ ...volley, nextLaunchInSimSeconds: CAST_LAUNCH_DELAY_LIMIT_SIM_SECONDS * 2 })).toBe(
      false,
    );
  });

  it.each([
    ['more distance left than its range', { remainingMetres: 101 }],
    ['no distance left', { remainingMetres: 0 }],
    ['a direction that is not a unit', { direction: [0, 0, 0] as Vec3 }],
    ['a negative damage', { damage: -1 }],
  ])('rejects a shot with %s', (_case, overrides) => {
    expect(validCastProjectileState(shot(overrides))).toBe(false);
  });

  it('restores detached copies and refuses the whole set when one entry is malformed', () => {
    const volley = launchedOnce();
    const restored = restoredCastFlight({ castVolleys: [volley], castProjectiles: [shot()] });
    restored.volleys[0]!.launched += 1;
    expect(volley.launched).toBe(1);
    expect(() =>
      restoredCastFlight({ castVolleys: [volley], castProjectiles: [shot({ remainingMetres: 0 })] }),
    ).toThrow();
  });
});
