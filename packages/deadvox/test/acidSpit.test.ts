import { describe, expect, it } from 'vitest';
import { requireDayCycle } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { acidSpitWindupProgress } from '../src/core/zombiePose.ts';
import type { AcidSpitRelease, PlayerSense } from '../src/core/zombies.ts';
import { startupContent } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const { registry } = startupContent();
const ACID = registry.zombies.get('acid_zombie')!;
const SPIT = ACID.acidSpit!;
const DAY_CYCLE = requireDayCycle(registry);
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR: SolidAt = (_x, y) => y === 0;
const WIND_FRAMES = Math.ceil(SPIT.windupSimSeconds * 60);

const inBand = (SPIT.rangeBand.nearMetres + SPIT.rangeBand.farMetres) / 2 / BLOCK_SIZE;
const PLAYER_POS: Vec3 = [0, 2, 0];
const zombieAt = (blocks: number): Vec3 => [blocks, 1, 0];

const sensed = (pos: Vec3, movement: PlayerSense['movement'] = 'still'): PlayerSense => ({
  pos,
  facing: [-1, 0, 0],
  movement,
  lit: false,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
  stance: 'standing',
});

interface Harness {
  system: ZombieSystem;
  releases: AcidSpitRelease[];
  sounds: string[];
  setSolid: (solid: SolidAt) => void;
}

const harness = (playerPos: () => PlayerSense, solid: SolidAt = FLOOR): Harness => {
  const releases: AcidSpitRelease[] = [];
  const sounds: string[] = [];
  let isSolid = solid;
  const system = new ZombieSystem({
    player: playerPos,
    isSolid: (x, y, z) => isSolid(x, y, z),
    isOpaque: (x, y, z) => isSolid(x, y, z),
    dayPhase: () => dayPhaseAt(DAY_CYCLE, 12 * 3600),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    onSound: (id) => {
      sounds.push(id);
    },
    onAcidSpit: (release) => {
      releases.push(release);
    },
  });
  return {
    system,
    releases,
    sounds,
    setSolid: (next) => {
      isSolid = next;
    },
  };
};

const frames = (system: ZombieSystem, count: number): void => {
  for (let frame = 0; frame < count; frame++) {
    system.tick(1 / 60);
  }
};

const WALL: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === Math.floor(inBand / 2) && y >= 1 && y <= 4);

const spawn = (h: Harness, blocks = inBand) => {
  const id = h.system.add(ACID, zombieAt(blocks), [-1, 0, 0]);
  return { id, zombie: h.system.store.get(id)! };
};

describe('acid spit', () => {
  it('starts a wind-up only on sight, never on a heard stimulus', () => {
    const seen = harness(() => sensed(PLAYER_POS));
    const seeing = spawn(seen);
    frames(seen.system, 2);
    expect(seeing.zombie.spitWindup).toBeGreaterThan(0);
    expect(seen.sounds).toContain(ACID.sounds.attack);

    const heard = harness(() => sensed(PLAYER_POS, 'sprinting'), WALL);
    const hearing = spawn(heard);
    const modes = new Set<string>();
    for (let frame = 0; frame < 300; frame++) {
      heard.system.tick(1 / 60);
      modes.add(hearing.zombie.mode);
      expect(hearing.zombie.spitWindup).toBe(0);
    }
    expect(modes).toContain('investigate');
    expect(modes).not.toContain('chase');
    expect(heard.sounds).not.toContain(ACID.sounds.attack);
  });

  it('exposes wind-up progress rising from zero toward one', () => {
    const h = harness(() => sensed(PLAYER_POS));
    const { zombie } = spawn(h);
    expect(acidSpitWindupProgress(zombie)).toBe(0);
    frames(h.system, 2);
    const early = acidSpitWindupProgress(zombie);
    frames(h.system, Math.floor(WIND_FRAMES / 2));
    expect(acidSpitWindupProgress(zombie)).toBeGreaterThan(early);
    expect(acidSpitWindupProgress(zombie)).toBeLessThan(1);
  });

  it('releases exactly one spit with the mover hit moves and no damage at release', () => {
    const h = harness(() => sensed(PLAYER_POS));
    const { zombie } = spawn(h);
    frames(h.system, WIND_FRAMES + 5);
    expect(h.releases).toHaveLength(1);
    const [{ moves, origin, aim }] = h.releases as [AcidSpitRelease];
    expect(moves).toEqual(SPIT.moves);
    // The spit leaves the posed mouth: ahead of the body toward the player and above its feet.
    expect(origin[0]).toBeLessThan(zombie.body.pos[0]);
    expect(origin[0]).toBeGreaterThan(PLAYER_POS[0]);
    expect(origin[1]).toBeGreaterThan(zombie.body.pos[1]);
    expect(Math.hypot(...aim)).toBeCloseTo(1, 5);
  });

  it('charges a full cooldown at release and a fraction when a hit cancels the wind-up', () => {
    const released = harness(() => sensed(PLAYER_POS));
    const first = spawn(released);
    frames(released.system, WIND_FRAMES + 5);
    expect(first.zombie.spitWait).toBeGreaterThan(SPIT.cooldownSimSeconds - 0.5);

    const hit = harness(() => sensed(PLAYER_POS));
    const second = spawn(hit);
    frames(hit.system, 10);
    expect(second.zombie.spitWindup).toBeGreaterThan(0);
    const [x, y, z] = second.zombie.body.pos;
    const origin: Vec3 = [x - 1, y + 1.3 / BLOCK_SIZE, z];
    expect(hit.system.swing(origin, [1, 0, 0], { ...FISTS_MELEE, damage: 1, reach: 4, cooldown: 0 })).toBe(second.id);
    expect(second.zombie.spitWindup).toBe(0);
    expect(second.zombie.spitWait).toBeCloseTo(SPIT.cancelPenaltyFraction * SPIT.cooldownSimSeconds, 5);
    frames(hit.system, WIND_FRAMES + 5);
    expect(hit.releases).toHaveLength(0);
  });

  it('spends no spit and no cooldown when the line from mouth to chest is blocked at release', () => {
    const h = harness(() => sensed(PLAYER_POS));
    const { zombie } = spawn(h);
    frames(h.system, 10);
    expect(zombie.spitWindup).toBeGreaterThan(0);
    h.setSolid(WALL);
    frames(h.system, WIND_FRAMES);
    expect(h.releases).toHaveLength(0);
    expect(zombie.spitWait).toBe(0);
  });

  it('lets low cover that clears a standing chest block a crouched one, so a crouched player draws no spit', () => {
    const eyeMetres = (crouching: boolean) => PLAYER.eye - (crouching ? PLAYER.crouch.eyeDropMetres : 0);
    const stanceAt = (feet: Vec3, crouching: boolean) => () => ({
      ...sensed(feet),
      stance: crouching ? ('crouching' as const) : ('standing' as const),
      eyeHeightMetres: eyeMetres(crouching),
    });

    // Whole-block cover must pass over the crouched eye, so sight holds and the wind-up starts, and over the
    // standing chest, yet cut the crouched chest line from the posed mouth. The player's sensed height is
    // searched in tenths of a block for a column where that holds, wherever the mouth and eye land.
    const coverFor = (feet: Vec3) => {
      const open = harness(stanceAt(feet, false));
      const watcher = spawn(open).zombie;
      frames(open.system, WIND_FRAMES + 5);
      const [{ origin }] = open.releases as [AcidSpitRelease];
      const eye: Vec3 = [watcher.body.pos[0], watcher.body.pos[1] + ACID.eyeHeightMetres / BLOCK_SIZE, 0];
      const heightAt = (from: Vec3, x: number, crouching: boolean, fraction: number) => {
        const target = feet[1] + (eyeMetres(crouching) * fraction) / BLOCK_SIZE;
        return from[1] + ((target - from[1]) * (x - from[0])) / (feet[0] - from[0]);
      };
      const chest = TEST_SENSE_TUNING.chestEyeFraction;
      // Lines fall toward the player, so a column's near edge is its lowest point and its far edge its highest.
      const columns = [...new Array(Math.max(0, Math.floor(origin[0]) - 1)).keys()].map((index) => {
        const x = index + 1;
        return { level: feet, column: x, top: Math.floor(heightAt(origin, x + 0.5, true, chest)) };
      });
      return columns.find(({ column: x, top: block }) => {
        const clears = (from: Vec3, crouching: boolean, fraction: number) =>
          heightAt(from, x, crouching, fraction) >= block + 1;
        return (
          block >= 1 &&
          heightAt(origin, x + 1, true, chest) < block + 1 &&
          clears(origin, false, chest) &&
          clears(eye, true, 1)
        );
      });
    };
    const found = [...new Array(10).keys()].map((tenth) => coverFor([0, 1 + tenth / 10, 0])).find(Boolean);
    expect(found).toBeDefined();
    const { level, column, top } = found!;
    const stance = (crouching: boolean) => stanceAt(level, crouching);
    const lowCover: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === column && y >= 1 && y <= top);

    const standing = harness(stance(false), lowCover);
    spawn(standing);
    frames(standing.system, WIND_FRAMES + 5);
    expect(standing.releases).toHaveLength(1);

    const crouched = harness(stance(true), lowCover);
    const { zombie } = spawn(crouched);
    frames(crouched.system, 10);
    expect(zombie.spitWindup).toBeGreaterThan(0);
    frames(crouched.system, WIND_FRAMES);
    expect(crouched.releases).toHaveLength(0);
    expect(zombie.spitWait).toBe(0);
  });

  it('holds ground inside the band, spitting each cooldown, and closes in beyond the far edge', () => {
    const h = harness(() => sensed(PLAYER_POS));
    const { zombie } = spawn(h);
    frames(h.system, 2);
    const held = [...zombie.body.pos];
    frames(h.system, Math.ceil((SPIT.cooldownSimSeconds * 2 + SPIT.windupSimSeconds) * 60));
    expect(zombie.body.pos[0]).toBeCloseTo(held[0]!, 1);
    expect(h.releases.length).toBeGreaterThanOrEqual(2);

    const far = harness(() => sensed(PLAYER_POS));
    const approaching = spawn(far, (SPIT.rangeBand.farMetres * 1.5) / BLOCK_SIZE);
    const [before] = approaching.zombie.body.pos;
    frames(far.system, 120);
    expect(approaching.zombie.body.pos[0]).toBeLessThan(before - 0.5);
  });

  it('finishes a winding-up spit point-blank and starts no melee wind-up until after the release', () => {
    let playerX = 0;
    const h = harness(() => sensed([playerX, 2, 0]));
    const { zombie } = spawn(h);
    frames(h.system, 10);
    expect(zombie.spitWindup).toBeGreaterThan(0);

    playerX = zombie.body.pos[0] - ACID.attack.reach / 2 / BLOCK_SIZE;
    for (let frame = 0; frame < WIND_FRAMES && h.releases.length === 0; frame++) {
      h.system.tick(1 / 60);
      expect(zombie.attackWindup).toBe(0);
    }
    expect(h.releases).toHaveLength(1);

    frames(h.system, 5);
    expect(zombie.attackWindup).toBeGreaterThan(0);
  });

  it('closes in to melee in the pocket inside the near edge and holds ground once back in the band', () => {
    const pocketMetres = (SPIT.rangeBand.nearMetres + ACID.attack.reach) / 2;
    const pocket = harness(() => sensed(PLAYER_POS));
    const closing = spawn(pocket, pocketMetres / BLOCK_SIZE);
    const [before] = closing.zombie.body.pos;
    frames(pocket.system, 30);
    expect(closing.zombie.body.pos[0]).toBeLessThan(before - 0.25);
    expect(closing.zombie.spitWindup).toBe(0);

    let playerX = 0;
    const regained = harness(() => sensed([playerX, 2, 0]));
    const returning = spawn(regained, pocketMetres / BLOCK_SIZE);
    frames(regained.system, 30);
    playerX = returning.zombie.body.pos[0] - inBand;
    frames(regained.system, 2);
    const [held] = returning.zombie.body.pos;
    frames(regained.system, 30);
    expect(returning.zombie.body.pos[0]).toBeCloseTo(held, 1);
    expect(returning.zombie.spitWindup + regained.releases.length).toBeGreaterThan(0);
  });

  it('round-trips mid-wind-up state so the restored zombie releases the same aim', () => {
    const h = harness(() => sensed(PLAYER_POS));
    const { id, zombie } = spawn(h);
    frames(h.system, Math.floor(WIND_FRAMES / 2));
    expect(zombie.spitWindup).toBeGreaterThan(0);
    const snapshot = structuredClone(h.system.snapshotState()) as ReturnType<ZombieSystem['snapshotState']>;

    const twin = harness(() => sensed(PLAYER_POS));
    twin.system.restoreState(snapshot, (typeId) => (typeId === ACID.id ? ACID : undefined));
    const restored = twin.system.store.get(id)!;
    expect(restored.spitWindup).toBe(zombie.spitWindup);
    expect(restored.spitWait).toBe(zombie.spitWait);

    frames(h.system, WIND_FRAMES);
    frames(twin.system, WIND_FRAMES);
    expect(h.releases).toHaveLength(1);
    expect(twin.releases).toEqual(h.releases);
  });
});
