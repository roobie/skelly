import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE } from '../src/core/zombies.ts';
import type { MoveIntent } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const FLAT = (_x: number, y: number): boolean => y === 0;

const makeRuntime = ({ isSolid = FLAT, spawn = [0, 1, 0] as Vec3 } = {}) => {
  const scale = makeScale(0.5);
  let intent: MoveIntent = { ...IDLE };
  let crouchToggle = false;
  let readyHeld = false;
  const footfalls: string[] = [];
  const session = createSession({
    registry,
    world: new World(),
    isSolid,
    isOpaque: isSolid,
    scale,
    seed: 73,
    start: 43_200,
    spawn,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      readyHeld: () => readyHeld,
      consumeCrouchToggle: () => {
        const pressed = crouchToggle;
        crouchToggle = false;
        return pressed;
      },
      yaw: () => 0,
      pitch: () => 0,
      walking: () => intent.walk,
      descending: () => false,
    },
    audio: {
      play: ({ event }) => {
        if (event.startsWith('footstep_')) {
          footfalls.push(event);
        }
      },
    },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      session.frame(1 / 60);
    }
  };
  return {
    session,
    get footfallCount() {
      return footfalls.length;
    },
    advance,
    setIntent: (next: MoveIntent) => {
      intent = next;
    },
    toggleCrouch: () => {
      crouchToggle = true;
    },
    setReadyHeld: (value: boolean) => {
      readyHeld = value;
    },
  };
};

const horizontalDistance = (from: readonly number[], to: readonly number[]): number =>
  Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);

describe('session movement consequences', () => {
  it('slows the same walking intent after leg damage', () => {
    const healthy = makeRuntime();
    const injured = makeRuntime();
    healthy.advance(120);
    injured.advance(120);
    injured.session.sim.hit(60, 'a test injury', 'leftLeg');

    const intent: MoveIntent = { ...IDLE, forward: 1, walk: true };
    healthy.setIntent(intent);
    injured.setIntent(intent);
    const healthyStart = [...healthy.session.body.pos];
    const injuredStart = [...injured.session.body.pos];
    healthy.advance(60);
    injured.advance(60);

    const healthyDistance = horizontalDistance(healthyStart, healthy.session.body.pos);
    const injuredDistance = horizontalDistance(injuredStart, injured.session.body.pos);
    expect(healthyDistance).toBeGreaterThan(0);
    expect(injuredDistance).toBeLessThan(healthyDistance);
  });

  it('feeds the session step clock to the readied-walk aim once per stride', () => {
    const runtime = makeRuntime();
    const firearm = runtime.session.inventory.create('pump_shotgun');
    expect(runtime.session.inventory.add(firearm, { kind: 'hand', side: 'right' })).toBe(true);
    runtime.setReadyHeld(true);
    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    runtime.advance(120);
    expect(runtime.session.firearms.isReady(firearm.uid)).toBe(true);

    let observedFootfalls = runtime.footfallCount;
    const signs: number[] = [];
    for (let tick = 0; tick < 480 && signs.length < 4; tick++) {
      runtime.advance(1);
      while (observedFootfalls < runtime.footfallCount) {
        signs.push(Math.sign(runtime.session.aim.frame.yaw));
        observedFootfalls += 1;
      }
    }

    expect(signs.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < signs.length; index++) {
      expect(signs[index]).toBe(-signs[index - 1]!);
    }
  });

  it('walks past a downed shambler in a corridor one person wide', () => {
    // Walls at x = -1 and x = 2 leave a corridor two blocks wide, along z.
    const corridor = (x: number, y: number): boolean => y === 0 || ((x === -1 || x === 2) && y >= 1 && y <= 4);
    const runtime = makeRuntime({ isSolid: corridor, spawn: [1, 1, 5] });
    const { session } = runtime;
    const shambler = registry.zombies.get('shambler')!;
    // One blow downs it at the torso; its head stays on, so it lies there instead of dying.
    const fragile = {
      ...shambler,
      regions: { ...shambler.regions, torso: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const id = session.zombies.add(fragile, [1, 1, 1], [0, 0, -1]);
    const zombie = session.zombies.store.get(id)!;
    const { blockSize } = makeScale(0.5);
    expect(2).toBeLessThan(2 * (session.body.halfWidth + zombie.body.halfWidth));
    const chest = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, blockSize)).torso.find(
      (box) => box.bone === 'chest',
    )!.center;
    const origin: Vec3 = [chest[0], chest[1], chest[2] + 0.45 / blockSize];
    expect(session.zombies.swing(origin, [0, 0, -1], FISTS_MELEE)).toBe(id);
    expect(zombie.incapacitated).toBe(true);

    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    runtime.advance(360);
    expect(session.body.pos[2]).toBeLessThan(zombie.body.pos[2] - zombie.body.halfWidth - session.body.halfWidth);
  });

  it('does not sprint or drain stamina while crouched with sprint held', () => {
    const runtime = makeRuntime();
    runtime.advance(120);
    runtime.toggleCrouch();
    runtime.setIntent({ ...IDLE, forward: 1, sprint: true });
    const { session } = runtime;
    const { needs } = session.sim;
    const { stamina } = needs;
    runtime.advance(60);

    expect(session.crouching).toBe(true);
    expect(session.sprinting).toBe(false);
    expect(needs.stamina).toBe(stamina);
  });
});
