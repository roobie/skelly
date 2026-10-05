import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import {
  footstepEventForBlock,
  type PlayerGait,
  STEP_DISTANCE_METRES,
  shamblerFootstepEventForBlock,
} from '../src/core/footsteps.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SimEvent, Timed } from '../src/core/sim.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { FISTS_MELEE, type Zombie } from '../src/core/zombies.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { firearmHandlingFor, SHELL_LOAD_SECONDS } from '../src/game/firearmHandling.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import type { MoveIntent } from '../src/game/player.ts';
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
const shamblerFootstepEvents = new Set(registry.blocks.map(({ id }) => shamblerFootstepEventForBlock(id)));

interface PlayedSound {
  sound: Readonly<SoundEmission>;
  expectedPosition?: Vec3;
}
interface ScenarioState {
  intent: MoveIntent;
  actor?: Zombie;
  swingOrigin?: Vec3;
  doorPosition?: Vec3;
  meleeStarted?: boolean;
}
interface Observation {
  label: string;
  passed: boolean;
}
type SoundEvent = Extract<SimEvent, { kind: 'sound' }>;
type NoiseEvent = Extract<SimEvent, { kind: 'noise' }>;
interface NoiseScenario {
  session: ReturnType<typeof createSession>;
  world: World;
  state: ScenarioState;
  events: Timed<SimEvent>[];
  played: PlayedSound[];
  observations: Observation[];
  rustlePositions: Map<string, Vec3[]>;
  blockSize: number;
  advance: (frames: number) => void;
  drainEvents: () => void;
}

it('pairs every discrete hearing stimulus with one positioned sound across movement, doors, fights and pain', () => {
  expect(contentNoiseEvents.size).toBeGreaterThan(0);
  const observe = (scenario: NoiseScenario, label: string, passed: boolean) => {
    scenario.observations.push({ label, passed });
  };
  const sourcePosition = (
    sound: Readonly<SoundEmission>,
    session: ReturnType<typeof createSession>,
    state: ScenarioState,
    rustlePositions: Map<string, Vec3[]>,
  ): Vec3 | undefined => {
    if (sound.event.startsWith('door_')) {
      return state.doorPosition!;
    }
    if (sound.event === 'melee_swing') {
      return state.swingOrigin!;
    }
    if (sound.event.startsWith('shambler_') || sound.event === 'melee_hit_fist') {
      return state.actor!.body.pos;
    }
    if (rustlePositions.has(sound.event)) {
      return undefined;
    }
    return session.chest();
  };

  const makeScenario = (): NoiseScenario => {
    const scale = makeScale(0.5);
    const world = new World();
    const state: ScenarioState = { intent: { ...IDLE } };
    const played: PlayedSound[] = [];
    const observations: Observation[] = [];
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
        intent: () => state.intent,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => state.intent.walk,
        descending: () => false,
        consumePrimaryAction: () => {
          state.intent = { ...state.intent, primaryAction: false };
        },
        primaryAction: () => {
          state.swingOrigin = session.chest();
          state.meleeStarted =
            startPlayerMelee(session.playerCombat, session.sim.needs, {
              origin: state.swingOrigin,
              direction: [0, 0, -1],
              weapon: FISTS_MELEE,
              profile: 'fists',
              twoHanded: false,
              hands: {
                right: session.inventory.hands.right?.uid ?? null,
                left: session.inventory.hands.left?.uid ?? null,
              },
            }) === 'started';
        },
      },
      audio: {
        play: (sound) => {
          const position = sourcePosition(sound, session, state, rustlePositions);
          played.push({ sound, ...(position ? { expectedPosition: [...position] } : {}) });
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
    const drainEvents = () => events.push(...reader.read());
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        session.frame(1 / 60);
        drainEvents();
      }
    };
    return {
      session,
      world,
      state,
      events,
      played,
      observations,
      rustlePositions,
      blockSize: scale.blockSize,
      advance,
      drainEvents,
    };
  };

  const coverFootstep = (scenario: NoiseScenario, event: string, block: string, gait: Exclude<PlayerGait, 'still'>) => {
    const { session, world, state, events, advance } = scenario;
    const floor = registry.blockIds.get(block)!;
    const feet = session.feet();
    for (let x = Math.floor(feet[0]) - 16; x <= Math.floor(feet[0]) + 16; x++) {
      for (let z = Math.floor(feet[2]) - 32; z <= Math.floor(feet[2]) + 8; z++) {
        world.setBlock(x, 0, z, floor);
      }
    }
    state.intent = { ...IDLE, forward: 1, walk: gait === 'walking', sprint: gait === 'sprinting' };
    const from = events.length;
    advance(120);
    const route = events.slice(from);
    observe(
      scenario,
      `${block}/${gait} emitted ${event}`,
      route.some((e) => e.kind === 'sound' && e.event === event),
    );
    const noisy = registry.sounds.get(event)!.noise.enabled;
    observe(
      scenario,
      `${event}/${gait} noise policy`,
      route.some((e) => e.kind === 'noise' && e.event === event) === noisy,
    );
    observe(scenario, `${gait} movement`, session.sprinting === (gait === 'sprinting'));
    state.intent = { ...IDLE };
  };

  const exerciseFootsteps = (scenario: NoiseScenario) => {
    // Movement hearing is continuous PlayerSense input; enumerate surface/gait outputs from their owners.
    const surfaces = new Map<string, string>();
    for (const block of registry.blocks) {
      if (block.solid) {
        const event = footstepEventForBlock(block.id);
        if (registry.sounds.has(event) && !surfaces.has(event)) {
          surfaces.set(event, block.id);
        }
      }
    }
    observe(scenario, 'footstep surfaces available', surfaces.size > 0);
    const gaits = Object.keys(STEP_DISTANCE_METRES) as Exclude<PlayerGait, 'still'>[];
    for (const [event, block] of surfaces) {
      for (const gait of gaits) {
        coverFootstep(scenario, event, block, gait);
      }
    }
  };

  const addRustleCase = (
    cases: Map<string, { block: string; fast: boolean; pair: readonly [string, string] }>,
    block: (typeof registry.blocks)[number],
  ) => {
    if (!block.rustle || block.solid) {
      return;
    }
    if (!cases.has(block.rustle.gentle)) {
      cases.set(block.rustle.gentle, {
        block: block.id,
        fast: false,
        pair: [block.rustle.gentle, block.rustle.fast],
      });
    }
    if (!cases.has(block.rustle.fast)) {
      cases.set(block.rustle.fast, {
        block: block.id,
        fast: true,
        pair: [block.rustle.gentle, block.rustle.fast],
      });
    }
  };

  const exerciseRustle = (scenario: NoiseScenario) => {
    const { session, world, state, events, rustlePositions, advance } = scenario;
    const rustleCases = new Map<string, { block: string; fast: boolean; pair: readonly [string, string] }>();
    for (const block of registry.blocks) {
      addRustleCase(rustleCases, block);
    }
    observe(scenario, 'rustle kinds available', rustleCases.size > 0);
    for (const [event, source] of rustleCases) {
      const feet = session.feet();
      const cell: Vec3 = [Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2])];
      world.setBlock(cell[0], cell[1], cell[2], registry.blockIds.get(source.block)!);
      const center: Vec3 = [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
      for (const kind of source.pair) {
        rustlePositions.set(kind, [...(rustlePositions.get(kind) ?? []), center]);
      }
      state.intent = { ...IDLE, forward: 1, walk: !source.fast };
      const from = events.length;
      advance(120);
      observe(
        scenario,
        `foliage noise ${event}`,
        events.slice(from).some((e) => e.kind === 'noise' && e.event === event),
      );
      state.intent = { ...IDLE };
      advance(1);
    }
  };

  const exerciseDoors = (scenario: NoiseScenario) => {
    const { session, state, played, advance } = scenario;
    const doorCell = session.feet();
    const doorOrigin: Vec3 = [Math.floor(doorCell[0]), Math.floor(doorCell[1]), Math.floor(doorCell[2])];
    const doorSize: Vec3 = [2, 4, 1];
    state.doorPosition = [
      doorOrigin[0] + doorSize[0] / 2,
      doorOrigin[1] + doorSize[1] / 2,
      doorOrigin[2] + doorSize[2] / 2,
    ];
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
    observe(scenario, 'occupied door remains open', door.open);
    state.intent = { ...IDLE, forward: 1 };
    advance(120);
    state.intent = { ...IDLE };
    doorAction(true);
    observe(scenario, 'vacated door closes', !door.open);
    for (const event of ['door_open', 'door_blocked_close', 'door_close']) {
      observe(
        scenario,
        `door sound ${event}`,
        played.some(({ sound }) => sound.event === event),
      );
    }
  };

  const exerciseShotgun = (scenario: NoiseScenario) => {
    const { session, events, blockSize, advance, drainEvents } = scenario;
    const gun = session.inventory.create('pump_shotgun');
    const bag = session.inventory.create('hiking_backpack');
    const shell = session.inventory.create('shell_12_gauge_00_buck');
    const gunHeld = session.inventory.add(gun, { kind: 'hand', side: 'right' });
    const bagWorn = session.inventory.add(bag, { kind: 'worn' });
    const shellCarried = session.inventory.add(shell, { kind: 'pocket', owner: bag, pocket: 0 });
    observe(scenario, 'shotgun items admitted', gunHeld && bagWorn && shellCarried);
    const loaded = session.firearms.load(shell, session.sim.time) === undefined;
    observe(scenario, 'shotgun loads', loaded);
    advance(Math.ceil(SHELL_LOAD_SECONDS * 60) + 1);
    const rackDuration = firearmHandlingFor(gun, registry).action.hand.durationSeconds;
    const racked = session.firearms.cock(gun.uid, session.sim.time) === undefined;
    observe(scenario, 'shotgun racks', racked);
    advance(Math.ceil(rackDuration * 60) + 1);
    const from = events.length;
    const fired = session.firearms.fire({
      feet: session.feet(),
      eye: session.chest(),
      yaw: 0,
      pitch: 0,
      blockSize,
      debugMode: false,
      item: gun,
      seed: 73,
      simTime: session.sim.time,
    });
    observe(scenario, 'shotgun fires', fired);
    drainEvents();
    observe(
      scenario,
      'shotgun noise emitted',
      events.slice(from).some((event) => event.kind === 'noise'),
    );
    observe(scenario, 'shotgun dropped', session.inventory.add(gun, { kind: 'pile', pos: session.feet() }));
  };

  const exerciseFight = (scenario: NoiseScenario) => {
    const { session, state, played, advance } = scenario;
    const shambler = registry.zombies.get('shambler')!;
    const player = session.body.pos;
    const id = session.zombies.add(shambler, [player[0], player[1], player[2] - 1], [0, 0, 1]);
    state.actor = session.zombieStore.get(id)!;
    const health = Object.values(state.actor.regions).reduce((sum, value) => sum + value, 0);
    state.intent = { ...IDLE, primaryAction: true };
    advance(30);
    state.intent = { ...IDLE };
    observe(scenario, 'player melee started', state.meleeStarted === true);
    observe(
      scenario,
      'melee damages shambler',
      Object.values(state.actor.regions).reduce((sum, value) => sum + value, 0) < health,
    );
    for (const event of ['melee_swing', 'melee_hit_fist', 'shambler_hurt']) {
      observe(
        scenario,
        `fight sound ${event}`,
        played.some(({ sound }) => sound.event === event),
      );
    }
    const from = played.length;
    state.intent = { ...IDLE, forward: -1 };
    advance(120);
    state.intent = { ...IDLE };
    observe(
      scenario,
      'chasing shambler footsteps',
      played.slice(from).some(({ sound }) => shamblerFootstepEvents.has(sound.event)),
    );
  };

  const exercisePlayerPain = (scenario: NoiseScenario) => {
    const { session, state, advance } = scenario;
    session.sim.hurt(2, 'scenario');
    advance(1);
    session.sim.hurt(16, 'scenario');
    advance(1);
    state.intent = { ...IDLE, jump: true };
    advance(1);
    state.intent = { ...IDLE };
  };

  const pairingChecks = (
    scenario: NoiseScenario,
  ): { sounds: Timed<SoundEvent>[]; noises: Timed<NoiseEvent>[]; checks: Observation[] } => {
    const { events, played, rustlePositions } = scenario;
    const sounds = events.filter((event): event is Timed<SoundEvent> => event.kind === 'sound');
    const noises = events.filter((event): event is Timed<NoiseEvent> => event.kind === 'noise');
    const checks: Observation[] = [];
    for (const { sound, expectedPosition } of played) {
      checks.push({ label: `finite position ${sound.event}`, passed: sound.position.every(Number.isFinite) });
      if (expectedPosition) {
        checks.push({
          label: `source position ${sound.event}`,
          passed: sound.position.every((value, i) => value === expectedPosition[i]),
        });
      }
      if (rustlePositions.has(sound.event)) {
        checks.push({
          label: `foliage source position ${sound.event}`,
          passed: Boolean(
            rustlePositions
              .get(sound.event)
              ?.some((position) => position.every((value, i) => value === sound.position[i])),
          ),
        });
      }
    }
    for (const noise of noises) {
      const matches = sounds.filter(
        (sound) =>
          sound.event === noise.event &&
          sound.time === noise.time &&
          sound.position.every((value, i) => value === noise.position[i]),
      );
      checks.push({ label: `noise has one sound ${noise.event}`, passed: matches.length === 1 });
      checks.push({
        label: `noise radius ${noise.event}`,
        passed: noise.radiusMetres === registry.sounds.get(noise.event)!.noise.radiusMetres,
      });
    }
    for (const sound of sounds) {
      const noisy = registry.sounds.get(sound.event)!.noise.enabled;
      const matches = noises.filter(
        (noise) =>
          noise.event === sound.event &&
          noise.time === sound.time &&
          noise.position.every((value, i) => value === sound.position[i]),
      );
      checks.push({ label: `sound policy ${sound.event}`, passed: sound.emittedAsNoise === noisy });
      checks.push({ label: `sound has policy noise ${sound.event}`, passed: matches.length === (noisy ? 1 : 0) });
    }
    return { sounds, noises, checks };
  };

  const fixture = makeScenario();
  exerciseFootsteps(fixture);
  exerciseRustle(fixture);
  exerciseDoors(fixture);
  exerciseShotgun(fixture);
  exerciseFight(fixture);
  exercisePlayerPain(fixture);
  const result = pairingChecks(fixture);
  expect(new Set(result.noises.map(({ event }) => event))).toEqual(contentNoiseEvents);
  expect(fixture.played.map(({ sound }) => sound)).toEqual(result.sounds.map(({ kind: _kind, ...sound }) => sound));
  for (const observation of [...fixture.observations, ...result.checks]) {
    expect(observation.passed, observation.label).toBe(true);
  }
});
