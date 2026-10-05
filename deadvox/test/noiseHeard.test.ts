import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { footstepEventForBlock, STEP_DISTANCE_METRES, type PlayerGait } from '../src/core/footsteps.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SimEvent, Timed } from '../src/core/sim.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { FISTS_MELEE, type Zombie } from '../src/core/zombies.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { firearmHandlingFor, SHELL_LOAD_SECONDS } from '../src/game/firearmHandling.ts';
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
const contentNoiseEvents = new Set(
  [...registry.sounds].filter(([, sound]) => sound.noise.enabled).map(([event]) => event),
);

it('pairs every discrete hearing stimulus with one positioned sound across movement, doors, fights and pain', () => {
  expect(contentNoiseEvents.size).toBeGreaterThan(0);
  const scale = makeScale(0.5);
  const world = new World();
  let intent = { ...IDLE };
  let actor: Zombie | undefined;
  let swingOrigin: Vec3 | undefined;
  let doorPosition: Vec3 | undefined;
  const played: { sound: Readonly<SoundEmission>; expectedPosition?: Vec3 }[] = [];
  const rustlePositions = new Map<string, Vec3[]>();
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
        let expectedPosition: Vec3 | undefined = session.chest();
        if (sound.event.startsWith('door_')) {
          expectedPosition = doorPosition!;
        } else if (sound.event === 'melee_swing') {
          expectedPosition = swingOrigin!;
        } else if (sound.event.startsWith('shambler_') || sound.event === 'melee_hit_fist') {
          expectedPosition = actor!.body.pos;
        } else if (sound.sourceLabel === 'brushing foliage') {
          expectedPosition = undefined;
        }
        played.push({ sound, ...(expectedPosition ? { expectedPosition: [...expectedPosition] } : {}) });
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
  // Movement hearing is continuous PlayerSense input; enumerate its surface/gait outputs from
  // the movement and content owners rather than pinning a copy of their mappings here.
  const footstepSurfaces = new Map<string, string>();
  for (const block of registry.blocks) {
    if (block.solid) {
      const event = footstepEventForBlock(block.id);
      if (registry.sounds.has(event) && !footstepSurfaces.has(event)) {
        footstepSurfaces.set(event, block.id);
      }
    }
  }
  expect(footstepSurfaces.size).toBeGreaterThan(0);
  const gaits = Object.keys(STEP_DISTANCE_METRES) as Exclude<PlayerGait, 'still'>[];
  for (const [event, block] of footstepSurfaces) {
    for (const gait of gaits) {
      const floor = registry.blockIds.get(block)!;
      const feet = session.feet();
      for (let x = Math.floor(feet[0]) - 16; x <= Math.floor(feet[0]) + 16; x++) {
        for (let z = Math.floor(feet[2]) - 32; z <= Math.floor(feet[2]) + 8; z++) {
          world.setBlock(x, 0, z, floor);
        }
      }
      intent = { ...IDLE, forward: 1, walk: gait === 'walking', sprint: gait === 'sprinting' };
      const from = events.length;
      advance(120);
      const route = events.slice(from);
      expect(
        route.filter((e) => e.kind === 'sound').map((e) => e.event),
        `${block}/${gait}`,
      ).toContain(event);
      const noisy = registry.sounds.get(event)!.noise.enabled;
      expect(route.some((e) => e.kind === 'noise' && e.event === event), `${event}/${gait}`).toBe(noisy);
      expect(session.sprinting).toBe(gait === 'sprinting');
      intent = { ...IDLE };
    }
  }

  // Every noise-enabled foliage sound in content is reached through player movement in that foliage.
  const rustleCases = new Map<string, { block: string; fast: boolean; pair: readonly [string, string] }>();
  for (const block of registry.blocks) {
    if (!block.rustle || block.solid) {
      continue;
    }
    if (!rustleCases.has(block.rustle.gentle)) {
      rustleCases.set(block.rustle.gentle, {
        block: block.id,
        fast: false,
        pair: [block.rustle.gentle, block.rustle.fast],
      });
    }
    if (!rustleCases.has(block.rustle.fast)) {
      rustleCases.set(block.rustle.fast, {
        block: block.id,
        fast: true,
        pair: [block.rustle.gentle, block.rustle.fast],
      });
    }
  }
  expect(rustleCases.size).toBeGreaterThan(0);
  for (const [event, source] of rustleCases) {
    const feet = session.feet();
    const cell: Vec3 = [Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2])];
    world.setBlock(cell[0], cell[1], cell[2], registry.blockIds.get(source.block)!);
    const center: Vec3 = [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
    for (const kind of source.pair) {
      rustlePositions.set(kind, [...(rustlePositions.get(kind) ?? []), center]);
    }
    intent = { ...IDLE, forward: 1, walk: !source.fast };
    const from = events.length;
    advance(120);
    expect(
      events.slice(from).some((e) => e.kind === 'noise' && e.event === event),
      `foliage noise ${event}`,
    ).toBe(true);
    intent = { ...IDLE };
    advance(1);
  }

  // Door outcomes use the queued gameplay action; walking out, rather than teleporting, clears the aperture.
  const doorCell = session.feet();
  const doorOrigin: Vec3 = [Math.floor(doorCell[0]), Math.floor(doorCell[1]), Math.floor(doorCell[2])];
  const doorSize: Vec3 = [2, 4, 1];
  doorPosition = [doorOrigin[0] + doorSize[0] / 2, doorOrigin[1] + doorSize[1] / 2, doorOrigin[2] + doorSize[2] / 2];
  const door = session.entities.add({ type: 'wood_door', pos: doorOrigin, size: doorSize, facing: 'n' })!;
  const doorAction = (closing: boolean) => {
    session.queue.enqueueAction(DOOR_ACTION, 'Door', registry.furniture.get('wood_door')!.door!.handling, {
      entityUid: door.uid,
      closing,
    });
    advance(60);
  };
  doorAction(false);
  doorAction(true);
  expect(door.open).toBe(true);
  intent = { ...IDLE, forward: 1 };
  advance(120);
  intent = { ...IDLE };
  doorAction(true);
  expect(door.open).toBe(false);
  for (const event of ['door_open', 'door_blocked_close', 'door_close']) {
    expect(played.some(({ sound }) => sound.event === event), event).toBe(true);
  }

  // A live actor emits world footsteps and takes a player melee hit without test-side body mutation.
  const shambler = registry.zombies.get('shambler')!;
  const player = session.body.pos;
  const id = session.zombies.add(shambler, [player[0], player[1], player[2] - 3], [0, 0, 1]);
  actor = session.zombieStore.get(id)!;
  advance(120);
  expect(played.some(({ sound }) => sound.event.startsWith('shambler_step_'))).toBe(true);
  const health = Object.values(actor.regions).reduce((sum, value) => sum + value, 0);
  intent = { ...IDLE, primaryAction: true };
  advance(30);
  intent = { ...IDLE };
  expect(Object.values(actor.regions).reduce((sum, value) => sum + value, 0)).toBeLessThan(health);
  for (const event of ['melee_swing', 'melee_hit_fist', 'shambler_hurt']) {
    expect(played.some(({ sound }) => sound.event === event), event).toBe(true);
  }

  // Damage reaches sound through the frame's damage reader, strain through the player jump tick.
  session.sim.hurt(2, 'scenario');
  advance(1);
  session.sim.hurt(16, 'scenario');
  advance(1);
  intent = { ...IDLE, jump: true };
  advance(1);
  intent = { ...IDLE };

  // Fire a loaded pump shotgun through the session's firearm owner so every content noise kind is exercised.
  const gun = session.inventory.create('pump_shotgun');
  const bag = session.inventory.create('hiking_backpack');
  const shell = session.inventory.create('shell_12_gauge_00_buck');
  expect(session.inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(session.inventory.add(bag, { kind: 'worn' })).toBe(true);
  expect(session.inventory.add(shell, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
  expect(session.firearms.load(shell, session.sim.time)).toBeUndefined();
  advance(Math.ceil(SHELL_LOAD_SECONDS * 60) + 1);
  const rackDuration = firearmHandlingFor(gun, registry).action.hand.durationSeconds;
  expect(session.firearms.cock(gun.uid, session.sim.time)).toBeUndefined();
  advance(Math.ceil(rackDuration * 60) + 1);
  expect(
    session.firearms.fire({
      feet: session.feet(),
      eye: session.chest(),
      yaw: 0,
      pitch: 0,
      blockSize: scale.blockSize,
      debugMode: false,
      item: gun,
      seed: 73,
      simTime: session.sim.time,
    }),
  ).toBe(true);
  events.push(...reader.read());
  const sounds = events.filter((event) => event.kind === 'sound');
  const noises = events.filter((event) => event.kind === 'noise');
  expect(new Set(noises.map(({ event }) => event))).toEqual(contentNoiseEvents);
  expect(played.map(({ sound }) => sound)).toEqual(sounds.map(({ kind: _kind, ...sound }) => sound));
  for (const { sound, expectedPosition } of played) {
    expect(sound.position.every(Number.isFinite), sound.event).toBe(true);
    if (expectedPosition) {
      expect(sound.position, sound.event).toEqual(expectedPosition);
    }
    if (sound.sourceLabel === 'brushing foliage') {
      expect(
        rustlePositions.get(sound.event)?.some((position) => position.every((value, i) => value === sound.position[i])),
        sound.event,
      ).toBe(true);
    }
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
