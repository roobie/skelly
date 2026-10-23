import { PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { firearmAttachmentResponse } from '../src/core/firearmAttachments.ts';
import { footstepEventForBlock, type PlayerGait, shamblerFootstepEventForBlock } from '../src/core/footsteps.ts';
import type { Item } from '../src/core/items.ts';
import { Rng } from '../src/core/random.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ZombieDef } from '../src/core/schema.ts';
import type { SimEvent, Timed } from '../src/core/sim.ts';
import type { SoundId } from '../src/core/soundEvents.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { simRate } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { figureSeedPool } from '../src/core/zombieFigure.ts';
import { hearVocalNoise, type Zombie } from '../src/core/zombies.ts';
import { spawnUnawareShambler } from '../src/debug/shamblerSpawning.ts';
import { firearmShotEmission, firearmShotSoundEvents } from '../src/game/audioPresentation.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import type { Engine } from '../src/game/engine.ts';
import { firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import type { MoveIntent } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { MobActorMeshes } from '../src/render/mobActors.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';

const registry = baseRegistry();
const contentNoiseEvents = new Set(
  [...registry.sounds].filter(([, sound]) => sound.noise.enabled).map(([event]) => event),
);
const shamblerFootstepEvents = new Set<SoundId | undefined>(
  registry.blocks.map((block) => shamblerFootstepEventForBlock(block)),
);

const blockBlow: ZombieDef['attack']['moves'][number] = {
  id: 'fixture-blow',
  motion: 'swing',
  weight: 1,
  damage: 10,
  damageKind: 'blunt',
  hitRegions: [{ region: 'leftArm', weight: 1 }],
};
const shamblerDef = registry.zombies.get('shambler')!;
const blockAttacker: ZombieDef = { ...shamblerDef, attack: { ...shamblerDef.attack, moves: [blockBlow] } };
const meleeSkill = registry.skills.get(CORE_CONTENT_IDS.meleeCombat)!;
const playerBody = registry.body.get('player')!;
/**
 * Every roll is a full-block roll and each blocked point costs a fixed share of the starting stamina,
 * so the first blow is stopped whole and the second can only be partly paid for.
 */
const blockContent = {
  ...registry,
  skills: new Map([
    ...registry.skills,
    [
      CORE_CONTENT_IDS.meleeCombat,
      {
        ...meleeSkill,
        combat: {
          ...meleeSkill.combat,
          melee: {
            ...meleeSkill.combat!.melee!,
            blockChanceMinimum: 1,
            blockChanceRange: 0,
            staminaCostFloor: 1,
            staminaPerAbsorbedPoint: (0.6 * playerBody.needs.spawn.stamina) / blockBlow.damage,
          },
        },
      },
    ],
  ]),
  body: new Map([
    ...registry.body,
    [
      'player',
      {
        ...playerBody,
        needs: {
          ...playerBody.needs,
          stamina: { ...playerBody.needs.stamina, recoverPerSimSecond: simRate(0.001) },
        },
      },
    ],
  ]),
};

interface PlayedSound {
  sound: Readonly<SoundEmission>;
  expectedPosition?: Vec3;
}
interface ScenarioState {
  intent: MoveIntent;
  actor?: Zombie;
  swingOrigin?: Vec3;
  doorPosition?: Vec3;
  furniturePosition?: Vec3;
  blastPosition?: Vec3;
  meleeStarted?: boolean;
  blocking?: boolean;
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

it('pairs every discrete hearing stimulus with one positioned sound across movement, doors, fights, blocks and pain', () => {
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
    if (sound.event === 'furniture_scrape' || sound.event === 'furniture_drag') {
      return state.furniturePosition!;
    }
    if (sound.event === 'melee_swing') {
      return state.swingOrigin!;
    }
    if (sound.event === 'grenade_blast') {
      return state.blastPosition!;
    }
    if (sound.event.startsWith('shambler_') || sound.event === 'melee_hit_fist') {
      return state.actor!.body.pos;
    }
    if (rustlePositions.has(sound.event)) {
      return undefined;
    }
    return session.chest();
  };

  const makeScenario = (content = registry): NoiseScenario => {
    const scale = makeScale(0.5);
    const world = new World();
    const state: ScenarioState = { intent: { ...IDLE } };
    const played: PlayedSound[] = [];
    const observations: Observation[] = [];
    const rustlePositions = new Map<string, Vec3[]>();
    let session: ReturnType<typeof createSession>;
    session = createSession({
      registry: content,
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
        blocking: () => state.blocking === true,
        intent: () => state.intent,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => state.intent.walk,
        descending: () => false,
        consumeDominantUse: () => {
          state.intent = { ...state.intent, useDominant: false };
        },
        useDominant: () => {
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
      onDetonation: (at) => {
        state.blastPosition = at.map((metres) => metres / scale.blockSize) as Vec3;
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
        const event = footstepEventForBlock(block);
        if (event && registry.sounds.has(event) && !surfaces.has(event)) {
          surfaces.set(event, block.id);
        }
      }
    }
    observe(scenario, 'footstep surfaces available', surfaces.size > 0);
    const gaits: Exclude<PlayerGait, 'still'>[] = ['walking', 'jogging', 'sprinting'];
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
    const { session, state, events, played, advance } = scenario;
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
      session.queue.enqueueAction(DOOR_ACTION, 'Door', registry.furniture.get('wood_door')!.door!.handlingSimSeconds, {
        entityUid: door.uid,
        closing,
      });
      advance(60);
    };
    const sideDoorEvents = events.length;
    doorAction(false);
    observe(
      scenario,
      'wood door opening stays quiet',
      !events.slice(sideDoorEvents).some((event) => event.kind === 'noise' && event.event === 'door_open'),
    );
    doorAction(true);
    observe(scenario, 'occupied door remains open', door.open);
    state.intent = { ...IDLE, forward: 1 };
    advance(120);
    state.intent = { ...IDLE };
    doorAction(true);
    observe(scenario, 'vacated door closes', !door.open);
    const rollerOrigin: Vec3 = [doorOrigin[0] + 4, doorOrigin[1], doorOrigin[2] + 4];
    const rollerDoor = session.entities.add({
      type: 'workshop_roller_door',
      pos: rollerOrigin,
      size: [6, 5, 1],
      facing: 'n',
    })!;
    const rollerCenter: Vec3 = [rollerOrigin[0] + 3, rollerOrigin[1] + 2.5, rollerOrigin[2] + 0.5];
    state.doorPosition = rollerCenter;
    session.queue.enqueueAction(
      DOOR_ACTION,
      'Open roller door',
      registry.furniture.get('workshop_roller_door')!.door!.handlingSimSeconds,
      { entityUid: rollerDoor.uid, closing: false },
    );
    advance(120);
    const rollerNoise = session.playerAudio.vocalNoise;
    observe(
      scenario,
      'roller-door opening enters the positioned noise path',
      rollerNoise?.pos.every((value, i) => value === rollerCenter[i]) ?? false,
    );
    for (const event of ['door_open', 'door_roller_open', 'door_blocked_close', 'door_close']) {
      observe(
        scenario,
        `door sound ${event}`,
        played.some(({ sound }) => sound.event === event),
      );
    }
    const soundCount = played.length;
    const eventCount = scenario.events.length;
    session.playPlayerSound('lock_pry', session.sim.time, { sourceLabel: 'noise-pairing fixture' });
    scenario.drainEvents();
    observe(
      scenario,
      'prying sound reaches the noise event path',
      scenario.events.slice(eventCount).some((event) => event.kind === 'noise' && event.event === 'lock_pry'),
    );
    observe(
      scenario,
      'prying sound is played',
      played.slice(soundCount).some(({ sound }) => sound.event === 'lock_pry'),
    );
    const hammerEventCount = scenario.events.length;
    session.playPlayerSound('lock_hammer', session.sim.time, { sourceLabel: 'noise-pairing fixture' });
    scenario.drainEvents();
    observe(
      scenario,
      'hammering sound reaches the noise event path',
      scenario.events.slice(hammerEventCount).some((event) => event.kind === 'noise' && event.event === 'lock_hammer'),
    );
    const feet = session.feet();
    const struckOrigin: Vec3 = [Math.floor(feet[0]) - 1, Math.floor(feet[1]), Math.floor(feet[2]) - 2];
    session.entities.add({ type: 'wood_door', pos: struckOrigin, size: doorSize, facing: 'n' });
    state.doorPosition = [struckOrigin[0] + 1, struckOrigin[1] + 2, struckOrigin[2] + 0.5];
    const strikeEvents = events.length;
    session.playerCombat.beginMeleeSwing({
      origin: session.chest(),
      direction: [0, 0, -1],
      weapon: FISTS_MELEE,
      profile: 'fists',
      twoHanded: false,
      hands: { right: null, left: null },
    });
    advance(60);
    scenario.drainEvents();
    observe(
      scenario,
      'a strike on a closed door enters the noise path',
      events.slice(strikeEvents).some((event) => event.kind === 'noise' && event.event === 'door_bash'),
    );
  };

  const exerciseFurnitureMove = (scenario: NoiseScenario) => {
    const { session, world, state, played, advance } = scenario;
    const feet = session.feet();
    const cell: Vec3 = [Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2])];
    const floorBlock = registry.blockIds.get('stone')!;
    for (let x = cell[0] - 8; x <= cell[0] + 8; x++) {
      for (let z = cell[2] - 8; z <= cell[2] + 8; z++) {
        world.setBlock(x, cell[1] - 1, z, floorBlock);
      }
    }
    const crate = registry.furniture.get('crate')!;
    const centre = (pos: Readonly<Vec3>): Vec3 => [
      pos[0] + crate.size[0] / 2,
      pos[1] + crate.size[1] / 2,
      pos[2] + crate.size[2] / 2,
    ];
    const piece = session.entities.add({
      type: crate.id,
      pos: [cell[0] + 3, cell[1], cell[2]],
      size: crate.size,
      facing: 'n',
    })!;
    state.furniturePosition = centre(piece.pos);
    const liftedAt = session.sim.time;
    observe(scenario, 'crate lifts', session.liftFurniture(piece.uid) === undefined);
    const { minIntervalSimSeconds } = registry.sounds.get('furniture_scrape')!;
    while (session.sim.time - liftedAt <= minIntervalSimSeconds) {
      advance(1);
    }
    const aimed: Vec3 = [cell[0] - 3, cell[1], cell[2]];
    const spot = session.furniturePlacement(aimed);
    if ('pos' in spot) {
      state.furniturePosition = centre(spot.pos);
    }
    observe(scenario, 'crate is set down', session.placeFurniture(aimed) === undefined);
    advance(1);
    observe(
      scenario,
      'lift and place both scrape',
      played.filter(({ sound }) => sound.event === 'furniture_scrape').length === 2,
    );
    const { maxSizeMetres, slide } = registry.inventory.get(CORE_CONTENT_IDS.player)!.furnitureMove;
    const oversized = [...registry.furniture.values()].find(
      (def) =>
        def.container &&
        !def.door &&
        !def.mount &&
        !def.vehicle &&
        !def.climbable &&
        !def.cover &&
        def.size[1] * scenario.blockSize > maxSizeMetres,
    );
    if (!oversized) {
      throw new Error('Furniture noise fixture needs an oversized loose container');
    }
    const heavy = session.entities.add({
      type: oversized.id,
      pos: [cell[0] + 2, cell[1], cell[2]],
      size: oversized.size,
      facing: 'n',
    })!;
    state.furniturePosition = [
      heavy.pos[0] + 1 + heavy.size[0] / 2,
      heavy.pos[1] + heavy.size[1] / 2,
      heavy.pos[2] + heavy.size[2] / 2,
    ];
    observe(scenario, 'oversized piece starts a floor step', session.slideFurniture(heavy.uid, 'push') === undefined);
    advance(Math.ceil(slide.stepSimSeconds * 60));
    observe(
      scenario,
      'floor step scrapes',
      played.some(({ sound }) => sound.event === 'furniture_drag'),
    );
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
    advance(Math.ceil(registry.items.get('pump_shotgun')!.firearm!.roundLoadSimSeconds! * 60) + 1);
    const rackDuration = firearmHandlingFor(gun, registry).action.hand.durationSimSeconds;
    const racked = session.firearms.cock(gun.uid, session.sim.time) === undefined;
    observe(scenario, 'shotgun racks', racked);
    advance(Math.ceil(rackDuration * 60) + 1);
    const from = events.length;
    const fired = session.firearms.fire({
      feet: session.feet(),
      eye: session.chest(),
      yaw: 0,
      pitch: 0,
      aimFrame: { yaw: 0, pitch: 0 },
      blockSize,
      ready: true,
      sprinting: false,
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
    const firedShotEvents = new Set(
      events
        .slice(from)
        .filter((event) => event.kind === 'sound')
        .map((event) => event.event),
    );
    for (const event of firearmShotSoundEvents(registry)) {
      if (firedShotEvents.has(event)) {
        continue;
      }
      const before = events.length;
      session.playPlayerSound(event, session.sim.time);
      drainEvents();
      observe(
        scenario,
        `${event} noise emitted`,
        events.slice(before).some((entry) => entry.kind === 'noise'),
      );
    }
    const referenceEvent = 'gunshot_pbs1_reference';
    const beforeReference = events.length;
    session.playPlayerSound(referenceEvent, session.sim.time);
    drainEvents();
    observe(
      scenario,
      `${referenceEvent} noise emitted`,
      events.slice(beforeReference).some((entry) => entry.kind === 'noise'),
    );
    observe(scenario, 'shotgun dropped', session.inventory.add(gun, { kind: 'pile', pos: session.feet() }));
  };

  const exerciseGrenade = (scenario: NoiseScenario) => {
    const { session, played, advance } = scenario;
    const grenade = session.inventory.create('frag_grenade');
    const feet = session.feet();
    session.fuses.togglePin(grenade);
    // Far beyond its reach, so the player is whole for the scenes that follow.
    const landed = session.inventory.add(grenade, { kind: 'pile', pos: [feet[0] + 80, feet[1], feet[2]] });
    observe(scenario, 'grenade lands', landed);
    advance(Math.ceil(registry.items.get('frag_grenade')!.explosive!.fuseSimSeconds * 60) + 10);
    observe(scenario, 'grenade goes off', session.inventory.itemByUid(grenade.uid) === undefined);
    observe(
      scenario,
      'grenade blast is played from where it went off',
      played.some(({ sound, expectedPosition }) => sound.event === 'grenade_blast' && expectedPosition),
    );
  };

  const exerciseFight = (scenario: NoiseScenario) => {
    const { session, world, state, played, advance } = scenario;
    const shambler = registry.zombies.get('shambler')!;
    const player = session.body.pos;
    const id = session.zombies.add(shambler, [player[0], player[1], player[2] - 1], [0, 0, 1]);
    state.actor = session.zombieStore.get(id)!;
    const health = Object.values(state.actor.regions).reduce((sum, value) => sum + value, 0);
    state.intent = { ...IDLE, useDominant: true };
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
    for (const event of ['melee_swing', 'melee_hit_fist']) {
      observe(
        scenario,
        `player melee ${event} follows the listener`,
        played.some(({ sound }) => sound.event === event && sound.listenerRelative),
      );
    }
    const from = played.length;
    state.intent = { ...IDLE, forward: -1 };
    const chaser = session.feet();
    const floorBlock = registry.blockIds.get('stone')!;
    for (let x = Math.floor(chaser[0]) - 24; x <= Math.floor(chaser[0]) + 24; x++) {
      for (let z = Math.floor(chaser[2]) - 48; z <= Math.floor(chaser[2]) + 16; z++) {
        world.setBlock(x, 0, z, floorBlock);
      }
    }
    advance(120);
    state.intent = { ...IDLE };
    observe(
      scenario,
      'chasing shambler footsteps',
      played.slice(from).some(({ sound }) => shamblerFootstepEvents.has(sound.event)),
    );
  };

  const exerciseBlocks = (scenario: NoiseScenario) => {
    const { session, state, played, advance } = scenario;
    const player = session.body.pos;
    const id = session.zombies.add(blockAttacker, [player[0], player[1], player[2] - 1], [0, 0, 1]);
    state.actor = session.zombieStore.get(id)!;
    state.blocking = true;
    const blockEvents = ['player_block_full', 'player_block_partial'];
    const blocked = () => blockEvents.every((event) => played.some(({ sound }) => sound.event === event));
    const twoBlowsFrames =
      Math.ceil((blockAttacker.attack.windupSimSeconds + blockAttacker.attack.cooldownSimSeconds) * 2 * 60) + 120;
    for (let frame = 0; frame < twoBlowsFrames && !blocked(); frame++) {
      advance(1);
    }
    state.blocking = false;
    for (const event of blockEvents) {
      observe(
        scenario,
        `block sound ${event}`,
        played.some(({ sound }) => sound.event === event),
      );
    }
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
  exerciseFurnitureMove(fixture);
  exerciseShotgun(fixture);
  exerciseGrenade(fixture);
  exerciseFight(fixture);
  exercisePlayerPain(fixture);
  // Blocks get a session of their own: the fight's shambler stays in the first one, and the block needs
  // tuned stamina that would change the other scenes.
  const blockFixture = makeScenario(blockContent);
  exerciseBlocks(blockFixture);
  const results = [fixture, blockFixture].map((scenario) => {
    const result = pairingChecks(scenario);
    for (const observation of scenario.observations) {
      expect(observation.passed, observation.label).toBe(true);
    }
    expect(scenario.played.map(({ sound }) => sound)).toEqual(result.sounds.map(({ kind: _kind, ...sound }) => sound));
    for (const observation of result.checks) {
      expect(observation.passed, observation.label).toBe(true);
    }
    return result;
  });
  expect(new Set(results.flatMap(({ noises }) => noises.map(({ event }) => event)))).toEqual(contentNoiseEvents);
});

it('lets a roller-door noise wake a nearby shambler through hearing', () => {
  const scale = makeScale(0.5);
  const session = createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y === 0,
    isOpaque: (_x, y) => y === 0,
    scale,
    seed: 73,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in roller-door hearing fixture');
    },
  });
  session.sim.paused = false;
  const doorOrigin: Vec3 = [0, 1, 0];
  const door = session.entities.add({ type: 'workshop_roller_door', pos: doorOrigin, size: [6, 5, 1], facing: 'n' })!;
  const listenerId = session.zombies.add(registry.zombies.get('shambler')!, [8, 1, 0.5]);
  const listener = session.zombieStore.get(listenerId)!;
  expect(listener.mode).toBe('idle');
  const handling = registry.furniture.get('workshop_roller_door')!.door!.handlingSimSeconds;
  session.queue.enqueueAction(DOOR_ACTION, 'Open roller door', handling, { entityUid: door.uid, closing: false });
  for (let frame = 0; frame < 120; frame++) {
    session.frame(1 / 60);
  }
  const noise = session.playerAudio.vocalNoise;
  expect(noise).toBeDefined();
  if (!noise) {
    throw new Error('Roller-door opening did not commit its noise stimulus');
  }
  expect(listener.lastVocalNoiseId).toBe(noise.id);
  expect(listener.mode).toBe('investigate');
  expect(listener.investigationTier).toBe('near');
  expect(listener.lastPerceived).toEqual(noise.pos);
});

it('debug test noise reaches a shambler behind a wall and starts its hearing gaze', () => {
  const scale = makeScale(0.5);
  const world = new World();
  const isSolid = (x: number, y: number, z: number): boolean =>
    y === 0 || ((Math.abs(x) === 2 || Math.abs(z) === 2) && y >= 1 && y <= 4);
  const session = createSession({
    registry,
    world,
    isSolid,
    isOpaque: isSolid,
    scale,
    seed: 73,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in debug-noise fixture');
    },
  });
  session.sim.paused = false;
  const debugEngine = {
    config: { scale, seed: 73 },
    registry,
    spawn: { pos: [0, 1, 0] },
    isSolid,
    isOpaque: isSolid,
    groundAt: () => scale.blockSize,
  } as unknown as Engine;
  expect(spawnUnawareShambler(debugEngine, session.body, session.zombies)).toBe(true);
  const [id, zombie] = [...session.zombieStore.entries()][0]!;
  for (let frame = 0; frame < 3; frame++) {
    session.frame(1 / 60);
  }
  expect(zombie.mode).not.toBe('chase');
  expect(zombie.lastPerceived).toBeUndefined();
  const events = session.sim.events.reader();
  expect(session.playPlayerSound('player_hurt_light', session.sim.time, { sourceLabel: 'debug test noise' })).toBe(
    true,
  );
  const emitted = events.read();
  const noise = session.playerAudio.vocalNoise;
  expect(emitted.some((event) => event.kind === 'noise' && event.event === 'player_hurt_light')).toBe(true);
  expect(noise).toBeDefined();
  if (!noise) {
    throw new Error('Debug test sound did not create a player noise');
  }
  for (let frame = 0; frame < 3; frame++) {
    session.frame(1 / 60);
  }
  expect(zombie.mode).toBe('hesitate');
  expect(zombie.investigationTier).toBe('near');
  expect(zombie.lastPerceived).toEqual(noise.pos);

  const renderer = new MobActorMeshes(scale.blockSize, 2, { figureSeeds: figureSeedPool(registry.zombies) });
  try {
    const camera = new PerspectiveCamera(55, 1, 0.01, 50);
    camera.position.set(4, 2, -3);
    camera.lookAt(2, 1, 0);
    camera.updateMatrixWorld(true);
    renderer.setCamera(camera);
    renderer.sync(session.zombieStore, 1 / 20, 1, false, 1, session.sim.time);
    const state = (renderer as unknown as { states: Map<number, { lookAtState: readonly number[] }> }).states.get(id)!;
    expect(state.lookAtState).not.toEqual([0, 0, 0, 1]);
  } finally {
    renderer.dispose();
  }
});

it('keeps a daytime background horde converging after a session shotgun blast', () => {
  const scale = makeScale(0.5);
  const world = new World();
  const session = createSession({
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
      intent: () => ({ ...IDLE }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in horde-noise fixture');
    },
  });
  session.sim.paused = false;
  const shambler = registry.zombies.get('shambler');
  if (!shambler) {
    throw new Error('Missing shambler fixture');
  }
  session.zombies.addHorde('noise-fixture', shambler, [150, 1, 0], 5);
  session.frame(0.5);
  const members = () => [...session.zombieStore.entries()].filter(([, zombie]) => zombie.hordeId === 'noise-fixture');
  const meanX = () => {
    const group = members();
    return group.reduce((total, [, zombie]) => total + zombie.body.pos[0] / group.length, 0);
  };
  expect(members().length).toBeGreaterThan(0);
  expect(members().every(([, zombie]) => zombie.tier === 'background')).toBe(true);
  const before = meanX();
  const shotgun = registry.sounds.get('shotgun_blast')!;
  const shotgunRadius = shotgun.noise.radiusMetres * shambler.hearing;
  const groupDistance = Math.max(
    ...members().map(
      ([, zombie]) =>
        Math.hypot(zombie.body.pos[0] - session.body.pos[0], zombie.body.pos[2] - session.body.pos[2]) *
        scale.blockSize,
    ),
  );
  expect(groupDistance).toBeLessThan(shotgunRadius);

  expect(session.playPlayerSound('shotgun_blast')).toBe(true);
  const noise = session.playerAudio.vocalNoise;
  expect(noise).toBeDefined();
  if (!noise) {
    throw new Error('Session shotgun blast did not commit a player-noise event');
  }
  for (let frame = 0; frame < 180; frame++) {
    session.frame(1 / 60);
  }

  const horde = session.zombies.snapshotState().hordes.find(({ id }) => id === 'noise-fixture');
  expect(members().every(([, zombie]) => zombie.lastVocalNoiseId === noise.id)).toBe(true);
  expect(horde?.lastNoiseId).toBe(noise.id);
  expect(horde?.mode).toBe('noise');
  expect(horde?.target[0]).toBeLessThan(before);
  expect(meanX()).toBeLessThan(before);
});

it('applies attachment noise factors and far-tier cutoffs to suppressed AR shots', () => {
  const scale = makeScale(0.5);
  const session = createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y === 0,
    isOpaque: (_x, y) => y === 0,
    scale,
    seed: 73,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE }),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in firearm hearing-range fixture');
    },
  });
  const shambler = registry.zombies.get('shambler');
  const tuning = registry.senses.get('player');
  if (!(shambler && tuning)) {
    throw new Error('Missing shambler hearing fixture');
  }
  const firearm = (type: string, slots: Item['slots'] = {}): Item => ({
    uid: 1,
    type,
    count: 1,
    condition: 1,
    slots,
  });
  const cases = [
    {
      label: 'unsuppressed AR',
      item: firearm('rifle_assault'),
      event: 'gunshot_m4',
      unsuppressedEvent: 'gunshot_m4',
      suppressed: false,
    },
    {
      label: 'suppressed AR',
      item: firearm('rifle_assault', { muzzle: firearm('real_suppressor') }),
      event: 'gunshot_m4_suppressed',
      unsuppressedEvent: 'gunshot_m4',
      suppressed: true,
    },
    {
      label: 'unsuppressed AK',
      item: firearm('rifle_ak'),
      event: 'gunshot',
      unsuppressedEvent: 'gunshot',
      suppressed: false,
    },
  ] as const;
  const emittedRadii = new Map<string, number>();

  for (const { label, item, event, unsuppressedEvent } of cases) {
    const attachmentNoiseFactor = firearmAttachmentResponse(registry, item).noiseFactor;
    const shot = firearmShotEmission(registry, item, session.firearms.noiseFactorFor(item));
    expect(shot.event).toBe(event);
    expect(shot.noiseRadiusScale).toBe(attachmentNoiseFactor);
    const emissions = session.sim.events.reader();
    const { noiseRadiusScale } = shot;
    expect(session.playPlayerSound(shot.event, session.sim.time, { noiseRadiusScale, sourceLabel: item.type })).toBe(
      true,
    );
    const noise = session.playerAudio.vocalNoise;
    expect(noise).toBeDefined();
    if (!noise) {
      throw new Error(`${label} did not commit player noise`);
    }
    const emitted = emissions.read();
    const noiseEvent = emitted.find((entry) => entry.kind === 'noise' && entry.event === event);
    expect(noiseEvent?.kind).toBe('noise');
    const unsuppressedBase = registry.sounds.get(unsuppressedEvent)!.noise.radiusMetres;
    emittedRadii.set(label, noise.radiusMetres);
    expect(noise.radiusMetres).toBe(registry.sounds.get(event)!.noise.radiusMetres * noiseRadiusScale);
    expect(noise.radiusMetres / unsuppressedBase).toBe(attachmentNoiseFactor);

    const farReachMetres = noise.radiusMetres * shambler.hearing * shambler.hearingModel.farMultiplier;
    const hearAtDistance = (distanceMetres: number) =>
      hearVocalNoise({
        zombie: shambler,
        from: [noise.pos[0] + distanceMetres / scale.blockSize, noise.pos[1], noise.pos[2]],
        noise,
        time: session.sim.time,
        blockSize: scale.blockSize,
        isSolid: (_x, y) => y === 0,
        rng: Rng.stream(73, 'm4-hearing-range'),
        tuning,
      });
    expect(hearAtDistance(farReachMetres * 0.99)).toBeDefined();
    expect(hearAtDistance(farReachMetres * 1.01)).toBeUndefined();
  }

  expect(emittedRadii.get('suppressed AR')! / emittedRadii.get('unsuppressed AR')!).toBe(
    firearmAttachmentResponse(registry, cases[1].item).noiseFactor,
  );
});
