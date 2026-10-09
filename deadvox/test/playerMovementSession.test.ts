import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { EntityId } from '../src/core/entities.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { bodyDistance, INVENTORY_REACH } from '../src/core/reach.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, ZombieDef } from '../src/core/schema.ts';
import { compileTemplate, footprint, type Placement, placedBlockAt } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, type Zombie } from '../src/core/zombies.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { type MoveIntent, PLAYER } from '../src/game/player.ts';
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

const FLAT: SolidAt = (_x, y) => y === 0;

const makeRuntime = ({ isSolid = FLAT, spawn = [0, 1, 0] as Vec3, yaw = 0 } = {}) => {
  const scale = makeScale(0.5);
  let intent: MoveIntent = { ...IDLE };
  let crouchToggle = false;
  let readyHeld = false;
  const footfalls: string[] = [];
  const refusals: string[] = [];
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
      yaw: () => yaw,
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
    refusal: (text) => {
      refusals.push(text);
    },
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
    refusals,
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

type Runtime = ReturnType<typeof makeRuntime>;
type Session = Runtime['session'];

const horizontalDistance = (from: readonly number[], to: readonly number[]): number =>
  Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);

const shambler = registry.zombies.get('shambler')!;
const { loot: _loot, ...lootless } = shambler;
// One blow downs it at the torso; its head stays on, so it lies there instead of dying. No limb comes off,
// and its pockets are empty, so anything on the ground came from clearing it.
const FRAGILE: ZombieDef = {
  ...lootless,
  regions: { ...shambler.regions, torso: FISTS_MELEE.damage },
  dismember: { chance: 0, headOnKillChance: 0 },
};

/** Adds a shambler facing -z and downs it with a blow to the chest, as the player would. */
const downShambler = (session: Session, position: Vec3): { id: EntityId; zombie: Zombie } => {
  const id = session.zombies.add(FRAGILE, position, [0, 0, -1]);
  const zombie = session.zombies.store.get(id)!;
  const { blockSize } = makeScale(0.5);
  const chest = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, blockSize)).torso.find(
    (box) => box.bone === 'chest',
  )!.center;
  const origin: Vec3 = [chest[0], chest[1], chest[2] + 0.45 / blockSize];
  if (session.zombies.swing(origin, [0, 0, -1], FISTS_MELEE) !== id || !zombie.incapacitated) {
    throw new Error('The blow did not down the shambler');
  }
  return { id, zombie };
};

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
    const { zombie } = downShambler(session, [1, 1, 1]);
    expect(2).toBeLessThan(2 * (session.body.halfWidth + zombie.body.halfWidth));

    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    runtime.advance(360);
    expect(session.body.pos[2]).toBeLessThan(zombie.body.pos[2] - zombie.body.halfWidth - session.body.halfWidth);
  });

  it('closes a door over a downed shambler lying in the doorway', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const door = session.entities.add({ type: 'wood_door', pos: [0, 1, -3], size: [2, 4, 1], facing: 'n' })!;
    session.entities.setOpen(door, true);
    const { zombie } = downShambler(session, [1, 1, -2.5]);
    expect(session.entities.bodyIntersects(door, zombie.body)).toBe(true);

    const { handlingSimSeconds } = registry.furniture.get('wood_door')!.door!;
    session.queue.enqueueAction(DOOR_ACTION, 'Door', handlingSimSeconds, { entityUid: door.uid, closing: true });
    runtime.advance(Math.ceil((handlingSimSeconds + 0.5) * 60));
    expect(door.open).toBe(false);
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

describe('crouching under a low ceiling', () => {
  const { blockSize } = makeScale(0.5);
  const crouchedBlocks = registry.senses.get('player')!.crouch.bodyHeightMetres / blockSize;
  // The lowest whole-block opening above the crouched body.
  const gapBlocks = Math.floor(crouchedBlocks) + 1;
  // A slab over z = -4..-2 leaves that opening above the floor; the player starts south of it, facing it.
  const SlabNear = -1;
  const SlabFar = -4;
  const crawlSpace = (_x: number, y: number, z: number): boolean =>
    y === 0 || (y === 1 + gapBlocks && z >= SlabFar && z < SlabNear);
  const start = (crouched: boolean): Runtime => {
    const runtime = makeRuntime({ isSolid: crawlSpace, spawn: [0, 1, 2] });
    if (crouched) {
      runtime.toggleCrouch();
    }
    runtime.advance(1);
    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    return runtime;
  };
  /** Walks on until the body is wholly past `z` or `frames` run out. */
  const walkPast = (runtime: Runtime, z: number, frames: number): void => {
    const { body } = runtime.session;
    for (let frame = 0; frame < frames && body.pos[2]! + body.halfWidth > z; frame++) {
      runtime.advance(1);
    }
  };

  it('lets a crouched player through an opening lower than the standing body, and not a standing one', () => {
    expect(gapBlocks).toBeLessThan(PLAYER.height / blockSize);
    const crouched = start(true);
    const standing = start(false);
    walkPast(crouched, SlabFar, 600);
    standing.advance(600);

    expect(crouched.session.body.pos[2]! + crouched.session.body.halfWidth).toBeLessThan(SlabFar);
    // Stopped against the slab's near edge.
    expect(standing.session.body.pos[2]! - standing.session.body.halfWidth).toBeCloseTo(SlabNear, 1);
  });

  it('walks through the authored FOB hole only when stance height fits', () => {
    const { layouts } = JSON.parse(readFileSync(join(BASE, 'layouts-playtest.json'), 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = layouts.find(({ buildings }) => buildings.some(({ template }) => template === 'camp_gate'))!;
    const building = camp.buildings.find(({ template }) => template === 'camp_wall_run_crouch_hole')!;
    const wall: Placement = {
      template: compileTemplate(registry, registry.templates.get(building.template)!),
      origin: building.position.map((metres) => metres / BLOCK_SIZE) as Vec3,
      turn: (building.rotation / 90) as Placement['turn'],
    };
    const [wallWidth, wallDepth] = footprint(wall);
    const groundBlock = Math.round(camp.ground / BLOCK_SIZE);
    const wallCellSolid = (x: number, y: number, z: number): boolean => {
      const block = placedBlockAt(wall, [x, y, z]);
      return block !== undefined && registry.blocks[block]?.solid === true;
    };
    const openingZ = Array.from({ length: wallDepth }, (_value, offset) => wall.origin[2] + offset).filter((z) =>
      Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every(
        (x) => !wallCellSolid(x, groundBlock + 1, z),
      ),
    );
    expect(openingZ.length).toBeGreaterThan(0);
    let openingHeightBlocks = 0;
    for (let y = groundBlock + 1; y < wall.origin[1] + wall.template.size[1]; y += 1) {
      if (
        !openingZ.every((z) =>
          Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every(
            (x) => !wallCellSolid(x, y, z),
          ),
        )
      ) {
        break;
      }
      openingHeightBlocks += 1;
    }
    const laneCenterZ = (openingZ[0]! + openingZ.at(-1)! + 1) / 2;
    const walkThrough = (isCrouched: boolean, oneBlockTaller = false) => {
      const isSolid: SolidAt = (x, y, z) => {
        if (
          oneBlockTaller &&
          y === groundBlock + 1 + openingHeightBlocks &&
          openingZ.includes(z) &&
          x >= wall.origin[0] &&
          x < wall.origin[0] + wallWidth
        ) {
          return false;
        }
        if (
          x >= wall.origin[0] &&
          x < wall.origin[0] + wallWidth &&
          z >= wall.origin[2] &&
          z < wall.origin[2] + wallDepth
        ) {
          return wallCellSolid(x, y, z);
        }
        return y <= groundBlock;
      };
      const runtime = makeRuntime({
        isSolid,
        spawn: [wall.origin[0] + wallWidth + 3, groundBlock + 1, laneCenterZ],
        yaw: Math.PI / 2,
      });
      if (isCrouched) {
        runtime.toggleCrouch();
        runtime.advance(1);
      }
      runtime.setIntent({ ...IDLE, forward: 1, walk: true });
      runtime.advance(600);
      const { body } = runtime.session;
      return {
        passed: body.pos[0]! + body.halfWidth < wall.origin[0],
        position: body.pos,
        halfWidth: body.halfWidth,
      };
    };

    const crouched = walkThrough(true);
    const standing = walkThrough(false);
    expect(crouched.passed, `crouched body stopped at ${crouched.position}`).toBe(true);
    expect(crouched.position[1]).toBeCloseTo(groundBlock + 1, 2);
    expect(standing.passed).toBe(false);
    expect(standing.position[0]! - standing.halfWidth).toBeGreaterThanOrEqual(wall.origin[0] + wallWidth - 0.05);

    const crouchedHeight = registry.senses.get('player')!.crouch.bodyHeightMetres;
    expect(openingHeightBlocks * BLOCK_SIZE).toBeGreaterThanOrEqual(crouchedHeight);
    expect(
      openingZ.every((z) =>
        Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every((x) =>
          wallCellSolid(x, groundBlock, z),
        ),
      ),
    ).toBe(true);
    expect(openingHeightBlocks * BLOCK_SIZE).toBeLessThan(PLAYER.height);
    expect(openingZ.length * BLOCK_SIZE).toBeGreaterThanOrEqual(PLAYER.halfWidth * 2);
    expect(walkThrough(false, true).passed).toBe(true);
  });

  it('refuses to stand up under the opening, and stands once clear of it', () => {
    const runtime = start(true);
    const { session } = runtime;
    walkPast(runtime, SlabNear, 600);
    runtime.setIntent({ ...IDLE });
    runtime.advance(30);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.crouching).toBe(true);
    expect(runtime.refusals).toHaveLength(1);

    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    walkPast(runtime, SlabFar, 600);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.crouching).toBe(false);
    expect(runtime.refusals).toHaveLength(1);
  });
});

describe('clearing a downed shambler', () => {
  const downed = shambler.downed!;
  /** Frames at 60 Hz that cover an action of `simSeconds` with a few handling ticks to spare. */
  const framesFor = (simSeconds: number): number => Math.ceil((simSeconds + 0.5) * 60);
  const groundItems = (session: Session) => [...session.inventory.piles.values()].flatMap((pile) => pile.items);

  it('finishes it off with no tool, ending it as a kill does and leaving nothing behind', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'finish-off')).toBeUndefined();
    runtime.advance(framesFor(downed.finishOff.simSeconds));
    expect(session.zombies.store.get(id)).toBeUndefined();
    expect(groundItems(session)).toEqual([]);
  });

  it('refuses to dismember it without a tool of the quality', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'dismember')).toEqual(expect.any(String));
    expect(session.queue.busy).toBe(false);
  });

  it('dismembers it with a tool of the quality, leaving its arms and head behind', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id, zombie } = downShambler(session, [0, 1, -2]);
    const { quality, level, simSeconds } = downed.dismember;
    const tool = [...registry.items.values()].find((item) => (item.tool?.qualities[quality] ?? 0) >= level)!;
    expect(session.inventory.add(session.inventory.create(tool.id), { kind: 'hand', side: 'right' })).toBe(true);
    expect(session.clearDownedBody(id, 'dismember')).toBeUndefined();
    runtime.advance(framesFor(simSeconds));
    expect(session.zombies.store.get(id)).toBeUndefined();
    expect(zombie.severed).toEqual(expect.arrayContaining(['upperArm.L', 'upperArm.R', 'head']));
    expect(groundItems(session)).toHaveLength(3);
  });

  it.each([
    [
      'cancelled',
      (runtime: Runtime) => runtime.session.queue.cancel(),
      (session: Session) => expect(session.queue.busy).toBe(false),
    ],
    [
      'walked out of reach',
      (runtime: Runtime) => runtime.setIntent({ ...IDLE, forward: -1 }),
      // Still running as it is about to end, with the body beyond reach.
      (session: Session, zombie: Zombie) => {
        expect(session.queue.busy).toBe(true);
        const player = {
          inventory: session.inventory,
          position: session.body.pos,
          blockSize: makeScale(0.5).blockSize,
        };
        expect(bodyDistance(player, zombie.body)).toBeGreaterThan(INVENTORY_REACH);
      },
    ],
  ])('leaves the body lying there when finishing it off is %s', (_, interrupt, premise) => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id, zombie } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'finish-off')).toBeUndefined();
    interrupt(runtime);
    const beforeEnd = Math.floor(downed.finishOff.simSeconds * 60) - 1;
    runtime.advance(beforeEnd);
    premise(session, zombie);
    runtime.advance(framesFor(downed.finishOff.simSeconds) - beforeEnd);
    expect(session.zombies.store.get(id)).toBe(zombie);
    expect(zombie.incapacitated).toBe(true);
  });
});
