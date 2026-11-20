import { blockId } from '@skelly/engine/content';
import { pickFurniture } from '@skelly/engine/internal/core/furniturePick.ts';
import { typeWeightGrams } from '@skelly/engine/internal/core/items.ts';
import { bearableKg } from '@skelly/engine/internal/core/ladders.ts';
import { pieceSize } from '@skelly/engine/internal/core/templates.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import { applyToHeldItem } from '@skelly/engine/internal/game/playerTickActions.ts';
import type { HandSide, Item } from '@skelly/engine/inventory';
import type { SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { dominantSide, offSide, PlayerTickActions } from '@skelly/engine/sim';
import { projectVehicleParts } from '@skelly/engine/vehicles';
import { BlockEntities, makeScale, type SolidAt, type Vec3, World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { type MoveIntent, PLAYER } from './playerFixture.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

const registry = baseRegistry();

const scale = makeScale(0.5);
const FACING_EAST = -Math.PI / 2;
const FACING_WEST = Math.PI / 2;
const ladderSize = (facing: 'w') => pieceSize(registry.furniture.get('ladder')!.size, facing);
const hatchSize = (facing: 'w') => pieceSize(registry.furniture.get('roof_hatch')!.size, facing);
/** Frames at 60 Hz for a climb of `blocks` with time to spare for the walk to and from it. */
const climbFrames = (blocks: number): number =>
  Math.ceil(
    ((blocks * scale.blockSize) / registry.furniture.get('ladder')!.climbable!.speedMetresPerSimSecond + 3) * 60,
  );
type Runtime = ReturnType<typeof makeRuntime>;
/** Advances until the body stands at `height` or the frames run out, so it doesn't walk on off the far side. */
const advanceUntilStandingAt = (runtime: Runtime, height: number, frames: number): void => {
  const { body } = runtime.session;
  for (let frame = 0; frame < frames && !(body.onGround && Math.abs(body.pos[1] - height) < 1e-3); frame++) {
    runtime.advance(1);
  }
};

/** A save to resume from, and the content to run on when a case needs fixture rows. */
interface RuntimeOptions {
  readonly restore?: Readonly<SaveSnapshot>;
  readonly content?: typeof registry;
  /** The blocks that furniture settling sees; the body sees `terrain`. */
  readonly world?: World;
}

const makeRuntime = (
  terrain: SolidAt,
  spawn: Vec3,
  entities: BlockEntities,
  { restore, content = registry, world = new World() }: RuntimeOptions = {},
) => {
  let intent: MoveIntent = { ...IDLE };
  let yaw = FACING_EAST;
  let dominantUse: () => void = () => undefined;
  const sounds: string[] = [];
  const refusals: string[] = [];
  const isSolid: SolidAt = (x, y, z) => terrain(x, y, z) || entities.isSolid(x, y, z);
  const session = createSession({
    registry: content,
    actorFigureFiles: stackActorFigureFiles(content),
    world,
    entities,
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
      readyHeld: () => false,
      consumeStanceToggle: () => undefined,
      yaw: () => yaw,
      pitch: () => 0,
      walking: () => intent.walk,
      descending: () => false,
      useDominant: () => dominantUse(),
    },
    audio: {
      play: ({ event }) => {
        sounds.push(event);
      },
    },
    notice: () => undefined,
    refusal: (text) => {
      refusals.push(text);
    },
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      session.frame(1 / 60);
    }
  };
  return {
    session,
    sounds,
    refusals,
    advance,
    set: (next: MoveIntent, facing = yaw) => {
      intent = next;
      yaw = facing;
    },
    /** What the dominant hand's use does, standing in for play's item actions. */
    onDominantUse: (act: () => void) => {
      dominantUse = act;
    },
    /** Presses the dominant hand's use for one frame, keeping the movement held. */
    pressDominantUse: () => {
      const held = intent;
      intent = { ...held, useDominant: true };
      advance(1);
      intent = held;
    },
  };
};

/** Grabs the ladder piece in `cell`, as F does, and climbs until the feet reach `height`. */
const grabAndClimbTo = (runtime: Runtime, cell: Vec3, height: number): void => {
  const { session } = runtime;
  const refused = session.grabLadder(session.entities.at(...cell)!);
  if (refused) {
    throw new Error(`Could not grab the ladder fixture: ${refused}`);
  }
  runtime.set({ ...IDLE, forward: 1, walk: true });
  for (let frame = 0; frame < climbFrames(height) && session.body.pos[1] < height; frame++) {
    runtime.advance(1);
  }
  if (session.body.pos[1] < height) {
    throw new Error(`The climb stopped at ${session.body.pos[1]}, short of ${height}`);
  }
};

const holdInHand = (runtime: Runtime, type: string, side?: HandSide): Item => {
  const { inventory } = runtime.session;
  const item = inventory.create(type);
  if (!inventory.add(item, { kind: 'hand', side: side ?? dominantSide(inventory.character) })) {
    throw new Error(`Could not hold the ${type} fixture`);
  }
  return item;
};
const itemDefs = [...registry.items.values()];
// The smallest, so it fits the worn pocket a case carries it in.
const twoHandedType = itemDefs
  .filter((def) => def.twoHanded)
  .sort((a, b) => a.size[0] * a.size[1] - b.size[0] * b.size[1])[0]!.id;
const oneHandedFoodType = itemDefs.find((def) => def.food && !def.twoHanded)!.id;

/**
 * A windowless block house whose flat roof stands higher than a hard landing, with a ladder of pieces against its
 * west wall up through the roof's layer, as authored roof-edge ladders are.
 */
const roofHeight = Math.ceil(BASE_SENSE_TUNING.footsteps.hardLandingMetres / scale.blockSize) + 2;
const house: SolidAt = (x, y, z) => y === 0 || (x >= 0 && x < 8 && y >= 1 && y < 1 + roofHeight && z >= -4 && z < 6);
const roofTop = 1 + roofHeight;
const LADDER_FOOT: Vec3 = [-1, 1, 0];
const houseWithLadder = (spawn: Vec3, options: RuntimeOptions = {}) => {
  const entities = new BlockEntities(options.content ?? registry);
  for (let y = 1; y < roofTop; y++) {
    entities.add({ type: 'ladder', pos: [-1, y, 0], size: ladderSize('w'), facing: 'w' });
  }
  return makeRuntime(house, spawn, entities, options);
};
/** A session loaded from `original`'s save and unpaused, as play resumes a loaded game. */
const resume = (original: Runtime): Runtime => {
  const resumed = houseWithLadder([-3, 1, 1], {
    restore: original.session.snapshot({ worldId: 'world', characterId: 'character' }),
  });
  resumed.session.sim.paused = false;
  return resumed;
};

describe('ladders', () => {
  it('keeps caller terrain solid while adding and removing vehicle occupancy', () => {
    // A one-part build: taking its only part off is the player's way to end a build and free the cells it filled.
    const wheel = registry.items.get('wheel_205_55r16')!;
    const solo = {
      ...registry,
      vehicleBlueprints: new Map(registry.vehicleBlueprints).set('fixture_solo', {
        id: 'fixture_solo',
        name: 'Fixture solo',
        fittings: [
          {
            id: 'only',
            part: wheel.id,
            at: [0, 0, 0] as [number, number, number],
            supportedBy: [],
            service: { mount: wheel.vehicle!.mount!, durationSimSeconds: simSeconds(1), qualities: {} },
          },
        ],
      }),
    };
    const runtime = houseWithLadder([-3, 1, 1], { content: solo });
    const { inventory } = runtime.session;
    const id = inventory.registerVehicle({
      blueprint: 'fixture_solo',
      placementKey: 'session-vehicle-collision',
      // A bare wheel is placed about its axle, so the build is raised to stand it clear of the ground.
      origin: [20, 2, 0],
      facing: 'n',
    });
    const vehicle = inventory.vehicles.get(id)!;
    const box = projectVehicleParts(solo, id, vehicle, scale.blockSize)
      .flatMap((part) => part.boxes)
      .sort((a, b) => b.max[1] - a.max[1])[0]!;
    const cell: Vec3 = [
      Math.floor(box.min[0] / scale.blockSize),
      Math.ceil(box.max[1] / scale.blockSize) - 1,
      Math.floor(box.min[2] / scale.blockSize),
    ];
    const { body } = runtime.session;
    body.pos = [cell[0] + 0.5, cell[1] + 5, cell[2] + 0.5];
    body.vel = [0, 0, 0];
    body.onGround = false;
    runtime.advance(600);
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeGreaterThan(1);

    // Taking the only part off ends the build, so its occupancy goes with it.
    const [only] = vehicle.fittings;
    inventory.canReach = () => true;
    expect(
      inventory.vehicleTransfer({
        kind: 'remove',
        vehicleId: id,
        fittingId: only!.id,
        itemUid: only!.item.uid,
        placement: only!,
        output: { kind: 'pile', pos: [-6, 1, -6] },
      }),
    ).toBeUndefined();
    expect(inventory.vehicles.get(id)).toBeUndefined();
    expect(inventory.locate(only!.item)).toMatchObject({ kind: 'pile' });
    body.pos = [cell[0] + 0.5, cell[1] + 5, cell[2] + 0.5];
    body.vel = [0, 0, 0];
    body.onGround = false;
    runtime.advance(600);
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(1, 3);
  });

  it('is climbed once grabbed, not when walked into, and stepped off at its top onto the roof', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const { body } = session;
    runtime.set({ ...IDLE, forward: 1, walk: true });
    runtime.advance(climbFrames(1));
    expect(body.pos[0] + body.halfWidth).toBeGreaterThan(LADDER_FOOT[0]);
    expect(body.pos[1]).toBeCloseTo(1, 3);
    expect(session.ladderHold.on).toBe(false);

    expect(session.grabLadder(session.entities.at(...LADDER_FOOT)!)).toBeUndefined();
    runtime.advance(1);
    expect(session.ladderHold.on).toBe(true);
    advanceUntilStandingAt(runtime, roofTop, climbFrames(roofHeight));
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(roofTop, 3);
    expect(body.pos[0] + body.halfWidth).toBeGreaterThan(0);
    expect(session.ladderHold.on).toBe(false);
  });

  it('climbs back down from the roof, which is no fall', () => {
    const runtime = houseWithLadder([1, roofTop, 1]);
    const { session } = runtime;
    expect(session.grabLadder(session.entities.at(-1, roofTop - 1, 0)!)).toBeUndefined();
    runtime.set({ ...IDLE, forward: 1, walk: true }, FACING_WEST);
    runtime.advance(climbFrames(roofHeight));
    const { body } = session;
    expect(body.onGround).toBe(true);
    expect(body.pos[1]).toBeCloseTo(1, 3);
    expect(runtime.sounds).not.toContain('player_landing_hard');
  });

  it('lets go while jump is held', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    grabAndClimbTo(runtime, LADDER_FOOT, roofTop - 3);
    const { body } = runtime.session;
    const gravity = registry.player.get('player')!.gravityMetresPerSimSecondSquared;
    const climbSpeed = registry.furniture.get('ladder')!.climbable!.speedMetresPerSimSecond;
    const dt = 1 / 60;
    const [, climbVelocity] = body.vel;
    runtime.set({ ...IDLE, jump: true });
    runtime.advance(1);
    expect(runtime.session.ladderHold.on).toBe(false);
    expect(body.vel[1]).toBeCloseTo(climbVelocity - (gravity * dt) / scale.blockSize);
    const [, letGo] = body.pos;
    const returnFrames = Math.ceil((2 * climbSpeed) / gravity / dt) + 2;
    for (let frame = 0; frame < returnFrames && body.pos[1] >= letGo; frame++) {
      runtime.advance(1);
    }
    expect(body.pos[1]).toBeLessThan(letGo);
  });

  it('lets go when strafing across a ladder', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    const { body } = runtime.session;
    runtime.set({ ...IDLE, right: 1 });
    runtime.advance(1);
    const [, letGo] = body.pos;
    runtime.advance(30);
    expect(body.pos[1]).toBeLessThan(letGo);
  });

  it('lets go of the ladder while unconscious', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    grabAndClimbTo(runtime, LADDER_FOOT, 1.2);
    const { body } = runtime.session;
    const simulationBody = runtime.session.sim.body;
    simulationBody.impact(30, 'torso', { kind: 'blunt' });
    simulationBody.impact(30, 'torso', { kind: 'blunt' });
    expect(simulationBody.actionRefusal).toBeDefined();
    const [, height] = body.pos;
    runtime.set(IDLE);
    runtime.advance(30);
    expect(body.pos[1]).toBeLessThan(height);
  });

  it('keeps a climber on the ladder through a save', () => {
    const original = houseWithLadder([-3, 1, 1]);
    grabAndClimbTo(original, LADDER_FOOT, 1.5);
    const resumed = resume(original);
    const { body } = resumed.session;
    const [, height] = body.pos;
    expect(height).toBeGreaterThanOrEqual(1.5);
    resumed.set(IDLE);
    resumed.advance(30);
    expect(resumed.session.ladderHold.on).toBe(true);
    expect(body.pos[1]).toBeCloseTo(height, 3);
  });

  it('keeps a ladder grabbed but not reached through a save, so the same input climbs it', () => {
    const original = houseWithLadder([-3, 1, 1]);
    expect(original.session.grabLadder(original.session.entities.at(...LADDER_FOOT)!)).toBeUndefined();
    const resumed = resume(original);
    for (const runtime of [original, resumed]) {
      runtime.set({ ...IDLE, forward: 1, walk: true });
      runtime.advance(climbFrames(1));
    }
    expect(original.session.body.pos[1]).toBeGreaterThan(1);
    expect(resumed.session.body.pos).toEqual(original.session.body.pos);
  });

  it('does not spend stamina when sprint is held on a ladder', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    grabAndClimbTo(runtime, LADDER_FOOT, 1.2);
    const { needs } = runtime.session.sim;
    const { stamina } = needs;
    runtime.set({ ...IDLE, forward: 1, sprint: true });
    runtime.advance(60);
    expect(runtime.session.sprinting).toBe(false);
    expect(needs.stamina).toBeGreaterThanOrEqual(stamina);
  });

  it('is not climbed by a shambler under a player on the roof', () => {
    const runtime = houseWithLadder([1, roofTop, 1]);
    const id = runtime.session.actors.add(registry.actors.get('shambler')!, [-3, 1, 1], [1, 0, 0]);
    runtime.advance(600);
    const shambler = runtime.session.actors.store.get(id)!;
    // It came for the player as far as the wall, into the ladder's cells, and stayed on the ground.
    expect(shambler.body.pos[0] + shambler.body.halfWidth).toBeGreaterThan(-1);
    expect(shambler.body.pos[1]).toBeLessThan(1 + PLAYER.stepHeight / scale.blockSize);
  });
});

describe('one hand on a ladder', () => {
  it('refuses a two-handed item through the refusal notice on a ladder, and uses it off one', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    holdInHand(runtime, twoHandedType);
    let uses = 0;
    runtime.onDominantUse(() => {
      uses += 1;
    });
    runtime.pressDominantUse();
    expect(uses).toBe(1);
    expect(runtime.refusals).toEqual([]);

    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    runtime.pressDominantUse();
    expect(uses).toBe(1);
    expect(runtime.refusals).toHaveLength(1);
  });

  it('uses a one-handed item on a ladder, holding the climb still until the action ends', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const food = holdInHand(runtime, oneHandedFoodType);
    runtime.onDominantUse(() => {
      expect(session.survival.use(food)).toBeUndefined();
    });
    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    runtime.pressDominantUse();
    expect(runtime.refusals).toEqual([]);
    expect(session.queue.busy).toBe(true);

    const { body } = session;
    const [, height] = body.pos;
    let frames = 0;
    for (; session.queue.busy && frames < 60 * 60; frames++) {
      runtime.advance(1);
      expect(body.pos[1]).toBeCloseTo(height, 6);
    }
    expect(session.queue.busy).toBe(false);
    expect(frames).toBeGreaterThan(1);
    runtime.advance(30);
    expect(body.pos[1]).toBeGreaterThan(height);
  });

  it('throws from the free hand on a ladder, ending one held in the hand that takes the ladder, and holds the climb still until a throw ends', () => {
    // Off a ladder a throw takes an occupied off hand. The hold takes that hand when the grab reaches the ladder, at
    // once at its foot or once walked to, and that ends the throw refused rather than moving it to the other hand.
    for (const atFoot of [true, false]) {
      const approach = houseWithLadder([-3, 1, 1]);
      const { inventory, throwCharge } = approach.session;
      holdInHand(approach, oneHandedFoodType);
      const kept = holdInHand(approach, oneHandedFoodType, offSide(inventory.character));
      approach.set({ ...IDLE, forward: 1, walk: true });
      approach.advance(atFoot ? climbFrames(1) : 0);
      expect(throwCharge.begin(approach.session.sim.time, false).kind).toBe('charging');
      expect(throwCharge.itemUid).toBe(kept.uid);
      expect(approach.session.grabLadder(approach.session.entities.at(...LADDER_FOOT)!)).toBeUndefined();
      for (let frame = 0; frame < climbFrames(1) && !approach.session.ladderHold.on; frame++) {
        approach.advance(1);
      }
      expect(approach.session.ladderHold.on).toBe(true);
      expect(throwCharge.release(approach.session.sim.time)).toBeUndefined();
      expect(approach.refusals).toHaveLength(1);
      expect(inventory.hands[offSide(inventory.character)]).toBe(kept);
    }

    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const { throwCharge } = session;
    const thrown = holdInHand(runtime, oneHandedFoodType);
    holdInHand(runtime, oneHandedFoodType, offSide(session.inventory.character));
    // The press begins the throw as play's `beginItemThrow` does.
    runtime.onDominantUse(() => throwCharge.begin(session.sim.time, session.queue.busy || session.firearms.busy));
    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    const { body } = session;
    for (const end of [() => throwCharge.release(session.sim.time), () => throwCharge.cancel()]) {
      runtime.pressDominantUse();
      expect(throwCharge.itemUid).toBe(thrown.uid);
      const [, height] = body.pos;
      runtime.advance(30);
      expect(body.pos[1]).toBeCloseTo(height, 6);
      end();
      runtime.advance(30);
      expect(body.pos[1]).toBeGreaterThan(height);
    }
  });

  it('keeps a released throw in its hand when a ladder takes that hand before the next player tick lands it', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const { inventory, throwCharge, body } = session;
    const kept = holdInHand(runtime, oneHandedFoodType, offSide(inventory.character));
    runtime.set({ ...IDLE, forward: 1, walk: true });
    runtime.advance(climbFrames(1));
    expect(throwCharge.begin(session.sim.time, false).kind).toBe('charging');
    const released = throwCharge.release(session.sim.time);
    if (!released) {
      throw new Error('The throw fixture released nothing');
    }
    // Play lands a released throw on the next player tick, as its live action and a replay's recorded one both do.
    const nextTick = new PlayerTickActions();
    const landings: unknown[] = [];
    nextTick.enqueue(() =>
      applyToHeldItem(inventory.hands, released.hand, released.itemUid, (item) => {
        landings.push(
          throwCharge.place(item, released.hand, {
            kind: 'pile',
            pos: body.pos.map(Math.floor) as Vec3,
          }),
        );
      }),
    );
    expect(session.grabLadder(session.entities.at(...LADDER_FOOT)!)).toBeUndefined();
    expect(session.ladderHold.hand()).toBe(released.hand);
    nextTick.applyAtNextTick();
    expect(landings).toEqual([{ landed: false, reason: session.ladderHold.refusal(released.hand) }]);
    expect(inventory.hands[released.hand]).toBe(kept);
  });

  it('refuses a free-hand swap that would ready a two-handed item while on a ladder', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const { inventory } = session;
    const side = dominantSide(inventory.character);
    const held = holdInHand(runtime, oneHandedFoodType, side);
    const backpack = inventory.create('school_backpack');
    expect(inventory.add(backpack, { kind: 'worn' })).toBe(true);
    const twoHanded = inventory.create(twoHandedType);
    const pocket = {
      kind: 'pocket',
      owner: backpack,
      pocket: 0,
      at: { x: 0, y: 0, rotated: false },
    } as const;
    expect(inventory.add(twoHanded, pocket)).toBe(true);
    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    const before = inventory.snapshotState();

    expect(inventory.move(held, pocket).ok).toBe(false);
    expect(inventory.snapshotState()).toEqual(before);
    expect(inventory.hands[side]).toBe(held);
    expect(inventory.locate(twoHanded)).toMatchObject({ kind: 'pocket', owner: backpack });
  });

  it('refuses moves into or out of the hand on the ladder, which keeps its item', () => {
    const runtime = houseWithLadder([-3, 1, 1]);
    const { session } = runtime;
    const { inventory, queue } = session;
    const kept = holdInHand(runtime, oneHandedFoodType, offSide(inventory.character));
    grabAndClimbTo(runtime, LADDER_FOOT, 1.5);
    const ladderHand = session.ladderHold.hand()!;
    const holding = session.ladderHold.refusal(ladderHand);
    const loose = inventory.create(oneHandedFoodType);
    expect(inventory.add(loose, { kind: 'pile', pos: session.feet() })).toBe(true);

    expect(queue.enqueue(loose, { kind: 'hand', side: ladderHand })).toEqual({ ok: false, reason: holding });
    expect(queue.enqueue(kept, { kind: 'pile', pos: session.feet() })).toEqual({ ok: false, reason: holding });
    expect(queue.enqueue(loose, { kind: 'hand', side: dominantSide(inventory.character) }).ok).toBe(true);
    runtime.set(IDLE);
    for (let frame = 0; queue.busy && frame < 60 * 60; frame++) {
      runtime.advance(1);
    }
    expect(inventory.hands[ladderHand]).toBe(kept);
    expect(inventory.hands[dominantSide(inventory.character)]).toBe(loose);
  });
});

const downspout = 'downspout';
const pipeFoot: Vec3 = [-1, 1, 0];
const pipeSize = pieceSize(registry.furniture.get(downspout)!.size, 'w');
/** The house's west wall and the ground before it as blocks, so a torn segment's neighbours hang on the wall. */
const houseWall = (): World => {
  const world = new World();
  const rock = blockId(registry, 'rock');
  for (let z = -1; z <= 1; z++) {
    for (let x = -4; x <= 0; x++) {
      world.setBlock(x, 0, z, rock);
    }
    for (let y = 1; y < roofTop; y++) {
      world.setBlock(0, y, z, rock);
    }
  }
  return world;
};
/** A sound downspout up the house's west wall, with the segment `worn` placed at `wear`, as worldgen places it. */
const houseWithPipe = (worn?: { readonly y: number; readonly wear: number }, options: RuntimeOptions = {}) => {
  const entities = new BlockEntities(registry);
  for (let y = 1; y < roofTop; y++) {
    const segment = entities.add({ type: downspout, pos: [-1, y, 0], size: pipeSize, facing: 'w' })!;
    if (y === worn?.y) {
      entities.wear(segment, worn.wear);
    }
  }
  // A save carries the wall's columns, so a restored session starts from an empty world.
  return makeRuntime(house, [-3, 1, 0.5], entities, { world: options.restore ? new World() : houseWall(), ...options });
};
const loadKg = (runtime: Runtime): number => PLAYER.bodyMassKg + runtime.session.inventory.carriedWeight() / 1000;
/** Grabs the pipe's foot and climbs until the hold ends or the feet stand on the roof. */
const climbPipe = (runtime: Runtime): void => {
  const { session } = runtime;
  const refused = session.grabLadder(session.entities.at(...pipeFoot)!);
  if (refused) {
    throw new Error(`Could not grab the downspout fixture: ${refused}`);
  }
  runtime.set({ ...IDLE, forward: 1, walk: true });
  const frames = climbFrames(roofHeight) * 2;
  for (let frame = 0; frame < frames && !(session.body.onGround && session.body.pos[1] >= roofTop - 1e-3); frame++) {
    runtime.advance(1);
  }
};
/** Packs a worn backpack with the item that fills it heaviest until the climber outweighs what `bears` kilograms carry. */
const packHeavierThan = (runtime: Runtime, bears: number): void => {
  const { inventory } = runtime.session;
  const pack = inventory.create('hiking_backpack');
  const [width, depth] = inventory.registry.items.get(pack.type)!.container!.pockets[0]!.grid!;
  // An assembly weighs what its model's parts do; an atom weighs what it authors.
  const weighed = itemDefs.filter(
    (def) => !def.twoHanded && (def.weight !== undefined || registry.models.get(def.model ?? '')?.parts !== undefined),
  );
  const filled = (def: (typeof itemDefs)[number]): number =>
    Math.floor(width / def.size[0]) * Math.floor(depth / def.size[1]) * typeWeightGrams(registry, def.id);
  const [heaviest] = weighed.sort((a, b) => filled(b) - filled(a));
  const [across, down] = heaviest!.size;
  let packed = inventory.add(pack, { kind: 'worn' });
  for (let y = 0; packed && y + down <= depth && loadKg(runtime) <= bears; y += down) {
    for (let x = 0; packed && x + across <= width && loadKg(runtime) <= bears; x += across) {
      const at = { x, y, rotated: false };
      packed = inventory.add(inventory.create(heaviest!.id), { kind: 'pocket', owner: pack, pocket: 0, at });
    }
  }
  if (!packed || loadKg(runtime) <= bears) {
    throw new Error(`Could not pack the backpack fixture past ${bears} kg`);
  }
};

describe('downspouts', () => {
  it('bears a light climber up a sound pipe to the roof', () => {
    const runtime = houseWithPipe();
    const { session } = runtime;
    expect(loadKg(runtime)).toBeLessThanOrEqual(bearableKg(session.entities, session.entities.at(...pipeFoot)!)!);
    climbPipe(runtime);
    expect(session.body.onGround).toBe(true);
    expect(session.body.pos[1]).toBeCloseTo(roofTop, 3);
    for (let y = 1; y < roofTop; y++) {
      expect(session.entities.at(-1, y, 0)).toBeDefined();
    }
  });

  it('tears off a worn segment under a light climber, who falls, leaving a gap the climb cannot cross, kept through a save', () => {
    // High enough that the climber is on the pipe, off the ground, when the body first loads it.
    const tornY = 5;
    const runtime = houseWithPipe({ y: tornY, wear: 0.99 });
    const { session } = runtime;
    const torn = session.entities.at(-1, tornY, 0)!;
    expect(loadKg(runtime)).toBeGreaterThan(bearableKg(session.entities, torn)!);
    climbPipe(runtime);
    expect(session.entities.at(-1, tornY, 0)).toBeUndefined();
    expect(session.ladderHold.on).toBe(false);
    const dropped = session.inventory.snapshotState().piles.flatMap((pile) => pile.items.map(({ item }) => item.type));
    expect(dropped).toEqual(registry.furniture.get(downspout)!.ruin!.debris.map(({ item }) => item));
    // The climber fell back to the ground, and climbs the pieces below the gap no higher than the gap.
    expect(session.body.onGround).toBe(true);
    expect(session.body.pos[1]).toBeCloseTo(1, 3);
    climbPipe(runtime);
    expect(session.body.pos[1]).toBeLessThanOrEqual(tornY + 1e-3);
    expect(session.entities.at(-1, tornY + 1, 0)).toBeDefined();

    const resumed = houseWithPipe(undefined, {
      restore: session.snapshot({ worldId: 'world', characterId: 'character' }),
    });
    expect(resumed.session.entities.at(-1, tornY, 0)).toBeUndefined();
    expect(resumed.session.entities.at(-1, tornY + 1, 0)).toBeDefined();
  });

  it('tears off the lowest loaded segment of a sound pipe under a heavy pack', () => {
    const runtime = houseWithPipe();
    const { session } = runtime;
    packHeavierThan(runtime, bearableKg(session.entities, session.entities.at(...pipeFoot)!)!);
    climbPipe(runtime);
    expect(session.entities.at(...pipeFoot)).toBeUndefined();
    expect(session.entities.at(pipeFoot[0], pipeFoot[1] + 1, pipeFoot[2])).toBeDefined();
    expect(session.body.pos[1]).toBeCloseTo(1, 3);
  });
});

describe('roof hatches', () => {
  /** A slab over the ground with a hatch in it above a free-standing ladder, as in the FOB armoury. */
  const slab = 5;
  const underHatch = () => {
    const entities = new BlockEntities(registry);
    for (let y = 1; y < slab; y++) {
      entities.add({ type: 'ladder', pos: [0, y, 0], size: ladderSize('w'), facing: 'w' });
    }
    const hatch = entities.add({ type: 'roof_hatch', pos: [-1, slab, 0], size: hatchSize('w'), facing: 'w' })!;
    const terrain: SolidAt = (x, y, z) =>
      y === 0 || (y === slab && !(x >= -1 && x < 2 && z >= 0 && z < 2) && Math.abs(x) < 12 && Math.abs(z) < 12);
    return { hatch, runtime: makeRuntime(terrain, [-2, 1, 0.4], entities) };
  };

  it('stops the climb while shut and lets the climber out onto the roof once open', () => {
    const { hatch, runtime } = underHatch();
    const { session } = runtime;
    expect(session.grabLadder(session.entities.at(0, 1, 0)!)).toBeUndefined();
    runtime.set({ ...IDLE, forward: 1, walk: true });
    runtime.advance(climbFrames(slab));
    expect(session.body.pos[1] + session.body.height).toBeLessThanOrEqual(slab + 1e-3);

    session.entities.setOpen(hatch, true);
    // Once its feet clear the roof, the climber steps out rather than dropping back into the hatch.
    let cleared = false;
    let droppedBack = false;
    for (let frame = 0; frame < climbFrames(slab) && !(session.body.onGround && cleared); frame++) {
      runtime.advance(1);
      cleared ||= session.body.pos[1] >= slab + 1;
      droppedBack ||= cleared && session.body.pos[1] < slab + 1 - 1e-3;
    }
    expect(session.body.onGround).toBe(true);
    expect(session.body.pos[1]).toBeCloseTo(slab + 1, 3);
    expect(droppedBack).toBe(false);
    const topLadder = session.entities.at(0, slab - 1, 1)!;
    expect(session.body.pos[2]).toBeCloseTo(topLadder.pos[2] + topLadder.size[2] / 2, 2);
  });

  it('is picked through the ladder by a climber, shut from below and open from above, while the ground picks the ladder', () => {
    const { hatch, runtime } = underHatch();
    const { session } = runtime;
    const pick = (origin: Vec3, direction: Vec3, throughLadders: boolean) =>
      pickFurniture({
        entities: session.entities,
        origin,
        direction,
        maxDistance: PLAYER.reach / scale.blockSize,
        blockSize: scale.blockSize,
        isSolid: (x, y, z) => y === slab && !session.entities.at(x, y, z),
        throughLadders,
      });
    const groundEye: Vec3 = [-2, 1 + PLAYER.eye / scale.blockSize, 1];
    expect(session.entities.defOf(pick(groundEye, [1, 0, 0], false)!).climbable).toBeDefined();
    // A climber's eye under the hatch, inside the ladder's top piece on its centre line.
    const below: Vec3 = [0.5, slab - 0.3, 1];
    expect(session.entities.defOf(session.entities.at(0, slab - 1, 1)!).climbable).toBeDefined();
    expect(pick(below, [0, 1, 0], true)).toBe(hatch);

    session.entities.setOpen(hatch, true);
    expect(pick(below, [0, 1, 0], true)).toBeUndefined();
    expect(pick([4, slab + 2, 1], [-1, 0, 0], false)).toBe(hatch);
  });
});
