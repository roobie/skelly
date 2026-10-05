import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SimEvent, Timed } from '../src/core/sim.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { FISTS_MELEE, type Zombie } from '../src/core/zombies.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown,
    })),
);

it('pairs every discrete hearing stimulus with one positioned sound across movement, doors, fights and pain', () => {
  const scale = makeScale(0.5);
  const world = new World();
  let intent = { ...IDLE };
  let actor: Zombie | undefined;
  let swingOrigin: Vec3 | undefined;
  const doorPosition: Vec3 = [5, 3, 0.5];
  const played: { sound: Readonly<SoundEmission>; expectedPosition: Vec3 }[] = [];
  let session: ReturnType<typeof createSession>;
  session = createSession({
    registry,
    world,
    isSolid: (_x, y) => y === 0,
    isOpaque: (_x, y) => y === 0,
    scale,
    seed: 73,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => intent.walk,
      descending: () => false,
      consumePrimaryAction: () => {
        intent = { ...intent, primaryAction: false };
      },
      primaryAction: () => {
        swingOrigin = session.chest();
        expect(
          startPlayerMelee(session.playerCombat, session.sim.needs, {
            origin: swingOrigin,
            direction: [0, 0, -1],
            weapon: FISTS_MELEE,
            profile: 'fists',
            twoHanded: false,
            hands: { right: null, left: null },
          }),
        ).toBe('started');
      },
    },
    audio: {
      play: (sound) => {
        let expectedPosition = session.chest();
        if (sound.event.startsWith('door_')) {
          expectedPosition = doorPosition;
        } else if (sound.event === 'melee_swing') {
          expectedPosition = swingOrigin!;
        } else if (sound.event.startsWith('shambler_') || sound.event === 'melee_hit_fist') {
          expectedPosition = actor!.body.pos;
        }
        played.push({ sound, expectedPosition: [...expectedPosition] });
      },
    },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in noise fixture');
    },
  });
  session.sim.paused = false;
  const reader = session.sim.events.reader();
  const events: Timed<SimEvent>[] = [];
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      session.frame(1 / 60);
      events.push(...reader.read());
    }
  };
  const resetPlayer = (position: Vec3 = [0, 1, 0]) => {
    session.body.pos = [...position];
    session.body.vel = [0, 0, 0];
    session.body.onGround = true;
  };

  // Six representative routes cover every sound surface and all three gaits; mapping/cadence
  // unit tests already cover the remaining equivalent combinations. Movement hearing is continuous
  // PlayerSense input, not an invented discrete noise event for content-disabled footfalls.
  for (const [block, event, gait] of [
    ['grass', 'footstep_grass', 'walking'],
    ['sand', 'footstep_sand', 'jogging'],
    ['dirt', 'footstep_mud', 'sprinting'],
    ['stone', 'footstep_stone', 'walking'],
    ['planks', 'footstep_wood', 'jogging'],
    ['fabric', 'footstep_leaves', 'sprinting'],
  ] as const) {
    const floor = registry.blockIds.get(block)!;
    for (let x = -16; x <= 16; x++) {
      for (let z = -32; z <= 8; z++) {
        world.setBlock(x, 0, z, floor);
      }
    }
    resetPlayer();
    intent = { ...IDLE, forward: 1, walk: gait === 'walking', sprint: gait === 'sprinting' };
    const from = events.length;
    advance(120);
    const route = events.slice(from);
    expect(
      route.filter((e) => e.kind === 'sound').map((e) => e.event),
      `${block}/${gait}`,
    ).toContain(event);
    expect(
      route.some((e) => e.kind === 'noise'),
      'footfalls remain content noise-disabled',
    ).toBe(false);
    expect(session.sprinting).toBe(gait === 'sprinting');
  }
  expect(session.playerAudio.vocalNoiseId).toBe(0);
  intent = { ...IDLE };
  resetPlayer();

  // A real moving actor uses the world-footstep callback, not the player's chest route.
  const shambler = registry.zombies.get('shambler')!;
  const id = session.zombies.add(shambler, [0, 1, -10], [0, 0, 1]);
  actor = session.zombieStore.get(id)!;
  actor.body.onGround = true;
  actor.mode = 'chase';
  actor.modeTimer = 100;
  actor.lastPerceived = [0, 1, 0];
  actor.horizontalSpeed = shambler.speed.chase;
  actor.lurchValue = 1;
  actor.stumbleFactor = 1;
  advance(120);
  expect(played.some(({ sound }) => sound.event === 'shambler_step_leaves')).toBe(true);
  session.zombies.setFrozen(true);
  actor.body.pos = [0, 1, -2];
  actor.body.vel = [0, 0, 0];
  resetPlayer();
  const health = Object.values(actor.regions).reduce((sum, value) => sum + value, 0);
  intent = { ...IDLE, primaryAction: true };
  advance(30);
  expect(Object.values(actor.regions).reduce((sum, value) => sum + value, 0)).toBeLessThan(health);
  for (const event of ['melee_swing', 'melee_hit_fist', 'shambler_hurt']) {
    expect(
      played.some(({ sound }) => sound.event === event),
      event,
    ).toBe(true);
  }

  // Execute all door outcomes through the same queued action as gameplay.
  const door = session.entities.add({ type: 'wood_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const doorAction = (closing: boolean) => {
    session.queue.enqueueAction(DOOR_ACTION, 'Door', registry.furniture.get('wood_door')!.door!.handling, {
      entityUid: door.uid,
      closing,
    });
    advance(60);
  };
  doorAction(false);
  resetPlayer([5, 1, 0.5]);
  doorAction(true);
  expect(door.open).toBe(true);
  resetPlayer();
  doorAction(true);
  expect(door.open).toBe(false);
  for (const event of ['door_open', 'door_blocked_close', 'door_close']) {
    expect(
      played.some(({ sound }) => sound.event === event),
      event,
    ).toBe(true);
  }

  // Damage reaches sound through the frame's damage reader, strain through the player jump tick.
  session.sim.hurt(2, 'scenario');
  advance(1);
  session.sim.hurt(16, 'scenario');
  advance(1);
  resetPlayer();
  intent = { ...IDLE, jump: true };
  advance(1);
  intent = { ...IDLE };
  for (const event of ['player_hurt_light', 'player_hurt_heavy', 'player_strain']) {
    expect(
      played.some(({ sound }) => sound.event === event),
      event,
    ).toBe(true);
  }

  const sounds = events.filter((event) => event.kind === 'sound');
  const noises = events.filter((event) => event.kind === 'noise');
  expect(noises).toHaveLength(3);
  expect(session.playerAudio.vocalNoiseId).toBe(noises.length);
  expect(played.map(({ sound }) => sound)).toEqual(sounds.map(({ kind: _kind, ...sound }) => sound));
  for (const { sound, expectedPosition } of played) {
    expect(sound.position, sound.event).toEqual(expectedPosition);
  }
  for (const noise of noises) {
    expect(
      sounds.filter(
        (sound) =>
          sound.event === noise.event &&
          sound.time === noise.time &&
          sound.position.every((v, i) => v === noise.position[i]),
      ),
      `noise without sound: ${noise.event}`,
    ).toHaveLength(1);
    expect(noise.radiusMetres).toBe(registry.sounds.get(noise.event)!.noise.radiusMetres);
  }
  // The reverse is content-driven, not gated by the emission's own emittedAsNoise claim.
  for (const sound of sounds) {
    const noisy = registry.sounds.get(sound.event)!.noise.enabled;
    expect(sound.emittedAsNoise, sound.event).toBe(noisy);
    expect(
      noises.filter(
        (noise) =>
          noise.event === sound.event &&
          noise.time === sound.time &&
          noise.position.every((v, i) => v === sound.position[i]),
      ),
      `sound/noise policy: ${sound.event}`,
    ).toHaveLength(noisy ? 1 : 0);
  }
});
