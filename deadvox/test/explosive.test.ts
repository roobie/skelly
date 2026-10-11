import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { fragmentDirections } from '../src/core/explosive.ts';
import type { Item } from '../src/core/items.ts';
import { Rng } from '../src/core/random.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import {
  decodeSave,
  encodeSave,
  SAVE_SCHEMA_VERSION,
  type SaveContentKind,
  type SaveVersionComponents,
} from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { SEVERED_ITEM, ZOMBIE_REGION_NAMES } from '../src/core/zombieRegionNames.ts';
import type { ZombieRegions } from '../src/core/zombieRegions.ts';
import type { Detonation } from '../src/core/zombies.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const BLOCK = 0.5;
const GRENADE = 'frag_grenade';
const FUSE = registry.items.get(GRENADE)!.explosive!.fuseSimSeconds;
const SHAMBLER = registry.zombies.get('shambler')!;
const OPEN: SolidAt = (_x, y) => y < 0;
/** A wall across the x axis in block column 2, well above head height. */
const WALL_AT_X2: SolidAt = (x, y) => y < 0 || (x === 2 && y < 10);

const version: SaveVersionComponents = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: { worldgen: 'worldgen-v2', shamblerFigure: 'shambler-figure-v1', amalgamFigure: 'amalgam-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};
const contentLookup = (kind: SaveContentKind, id: string): boolean => {
  switch (kind) {
    case 'item':
      return registry.items.has(id);
    case 'zombie':
      return registry.zombies.has(id);
    case 'sound':
      return registry.sounds.has(id);
    default:
      return true;
  }
};

const runtime = (isSolid: SolidAt = OPEN, restore?: Readonly<SaveSnapshot>) =>
  createSession({
    registry,
    world: new World(),
    isSolid,
    isOpaque: () => false,
    scale: makeScale(BLOCK),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => true,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
type Runtime = ReturnType<typeof runtime>;

/** A grenade that has just landed in a pile at block `pos`; with its pin pulled, its fuse lights on the next step. */
const landedGrenade = (session: Runtime, pos: Vec3, pinPulled = true): Item => {
  const grenade = session.inventory.create(GRENADE);
  if (pinPulled) {
    session.fuses.togglePin(grenade);
  }
  if (!session.inventory.add(grenade, { kind: 'pile', pos })) {
    throw new Error('Could not land the grenade fixture');
  }
  return grenade;
};

/** A grenade in the player's right hand, its pin pulled. */
const liveInHand = (session: Runtime): Item => {
  const grenade = session.inventory.create(GRENADE);
  if (!session.inventory.add(grenade, { kind: 'hand', side: 'right' })) {
    throw new Error('Could not hold the grenade fixture');
  }
  session.fuses.togglePin(grenade);
  return grenade;
};

const healthLost = (before: ZombieRegions, after: ZombieRegions): number =>
  ZOMBIE_REGION_NAMES.reduce((sum, region) => sum + before[region]! - after[region]!, 0);

/** A detonation in blocks at `origin`; without `fragmentCount`, it throws no fragments. */
const detonation = (origin: Vec3, blast: Detonation['blast'], fragmentCount = 0): Detonation => ({
  blast,
  fragments: {
    origin,
    directions: fragmentDirections(Rng.stream(5, 'test-fragments'), fragmentCount),
    damage: 5,
    impulse: 0.1,
    rangeMetres: 10,
  },
});

describe('hand grenade', () => {
  it('is pinned and unpinned by its primary action in hand', () => {
    const session = runtime();
    const grenade = session.inventory.create(GRENADE);
    expect(session.inventory.add(grenade, { kind: 'hand', side: dominantSide(session.inventory.character) })).toBe(
      true,
    );
    expect(selectPrimaryAction(session.inventory)).toMatchObject({ kind: 'pin', item: grenade });
    expect(session.fuses.state(grenade)).toBe('in');
    expect([session.fuses.togglePin(grenade), session.fuses.togglePin(grenade)]).toEqual(['pulled', 'in']);
  });

  it('lights only when it leaves the hand with its pin pulled, and a lit fuse cannot be stopped', () => {
    const session = runtime();
    const dud = landedGrenade(session, [1, 0, 0], false);
    const held = liveInHand(session);
    const { health } = session.sim.body;
    session.sim.scheduler.advance(FUSE + 0.5);
    expect([session.inventory.itemByUid(dud.uid), session.inventory.itemByUid(held.uid)]).toEqual([dud, held]);
    expect(session.fuses.togglePin(held)).toBe('in');
    expect(session.inventory.move(held, { kind: 'pile', pos: [1, 0, 1] }).ok).toBe(true);
    session.sim.scheduler.advance(FUSE + 0.5);
    expect([session.inventory.itemByUid(held.uid), session.sim.body.health]).toEqual([held, health]);

    expect(session.inventory.move(held, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(session.fuses.togglePin(held)).toBe('pulled');
    expect(session.inventory.move(held, { kind: 'pile', pos: [1, 0, 1] }).ok).toBe(true);
    session.sim.scheduler.advance(0.5);
    expect(session.fuses.togglePin(held)).toBe('burning');
    session.sim.scheduler.advance(FUSE);
    expect(session.inventory.itemByUid(held.uid)).toBeUndefined();
    expect(session.sim.body.health).toBeLessThan(health);

    const stowed = liveInHand(session);
    const fannyPack = session.inventory.create('fanny_pack');
    expect(session.inventory.add(fannyPack, { kind: 'worn' })).toBe(true);
    expect(session.inventory.move(stowed, { kind: 'pocket', owner: fannyPack, pocket: 0 }).ok).toBe(true);
    session.sim.scheduler.advance(FUSE + 0.5);
    expect(session.inventory.itemByUid(stowed.uid)).toBeUndefined();
  });

  it('goes off in the hand of whoever picks it up while its fuse burns', () => {
    const session = runtime();
    const grenade = landedGrenade(session, [1, 0, 0]);
    session.sim.scheduler.advance(FUSE / 2);
    expect(session.inventory.move(grenade, { kind: 'hand', side: 'right' }).ok).toBe(true);
    const { health } = session.sim.body;
    session.sim.scheduler.advance(FUSE);
    expect(session.inventory.itemByUid(grenade.uid)).toBeUndefined();
    expect(session.sim.body.health).toBeLessThan(health);
  });

  it('goes off where it landed once its fuse runs out, hurting the player beside it', () => {
    const session = runtime();
    const grenade = landedGrenade(session, [1, 0, 0]);
    const { health } = session.sim.body;
    session.sim.scheduler.advance(FUSE - 0.5);
    expect([session.inventory.itemByUid(grenade.uid), session.sim.body.health]).toEqual([grenade, health]);
    session.sim.scheduler.advance(1);
    expect(session.inventory.itemByUid(grenade.uid)).toBeUndefined();
    expect(session.sim.body.health).toBeLessThan(health);
  });

  it('spares the player behind a wall from its blast and fragments', () => {
    const session = runtime(WALL_AT_X2);
    const grenade = landedGrenade(session, [3, 0, 0]);
    const { health } = session.sim.body;
    session.sim.scheduler.advance(FUSE + 0.5);
    expect(session.inventory.itemByUid(grenade.uid)).toBeUndefined();
    expect(session.sim.body.health).toBe(health);
  });

  it('keeps a pulled pin and a burning fuse through a save, so the loaded grenades still go off', async () => {
    const original = runtime();
    const grenade = landedGrenade(original, [1, 0, 0]);
    const held = liveInHand(original);
    original.sim.scheduler.advance(FUSE / 2);
    const bytes = await encodeSave(original.snapshot({ worldId: 'world', characterId: 'character' }), {
      generation: 1,
      version,
      worldOptions: { blockSize: BLOCK, site: 'testHouse', storeys: 1, density: 0.75 },
    });
    const resumed = runtime(OPEN, (await decodeSave(bytes, { version, contentLookup })).snapshot);
    const remaining = resumed.inventory.itemByUid(grenade.uid)?.fuseRemainingSimSeconds;
    expect(remaining).toBe(grenade.fuseRemainingSimSeconds);
    const resumedHeld = resumed.inventory.itemByUid(held.uid)!;
    expect(resumed.fuses.state(resumedHeld)).toBe('pulled');
    const { health } = resumed.sim.body;
    resumed.sim.scheduler.advance(remaining! + 0.5);
    expect(resumed.inventory.itemByUid(grenade.uid)).toBeUndefined();
    expect(resumed.sim.body.health).toBeLessThan(health);
    expect(resumed.inventory.move(resumedHeld, { kind: 'pile', pos: [1, 0, 1] }).ok).toBe(true);
    resumed.sim.scheduler.advance(FUSE + 0.5);
    expect(resumed.inventory.itemByUid(held.uid)).toBeUndefined();
  });

  it('hurts a nearer shambler more, and none beyond the blast radius', () => {
    const session = runtime();
    const origin: Vec3 = [0, 1, 0];
    const near = session.zombieStore.get(session.zombies.add(SHAMBLER, [2, 0, 0]))!;
    const far = session.zombieStore.get(session.zombies.add(SHAMBLER, [-6, 0, 0]))!;
    const beyond = session.zombieStore.get(session.zombies.add(SHAMBLER, [0, 0, 14]))!;
    const before = [near, far, beyond].map(({ regions }) => ({ ...regions }));
    session.zombies.detonate(detonation(origin, { radiusMetres: 6, damage: 20, impulse: 1 }));
    const [nearLoss, farLoss, beyondLoss] = [near, far, beyond].map(({ regions }, i) =>
      healthLost(before[i]!, regions),
    );
    expect(farLoss).toBeGreaterThan(0);
    expect(nearLoss).toBeGreaterThan(farLoss!);
    expect(beyondLoss).toBe(0);
  });

  it('stops blast and fragments at a wall, while a shambler as close on the open side is hit', () => {
    const session = runtime(WALL_AT_X2);
    const sheltered = session.zombieStore.get(session.zombies.add(SHAMBLER, [6, 0, 0.5]))!;
    const open = session.zombieStore.get(session.zombies.add(SHAMBLER, [-5, 0, 0.5]))!;
    const before = [sheltered, open].map(({ regions }) => ({ ...regions }));
    session.zombies.detonate(detonation([0.5, 1, 0.5], { radiusMetres: 6, damage: 20, impulse: 1 }, 400));
    expect(healthLost(before[0]!, sheltered.regions)).toBe(0);
    expect(healthLost(before[1]!, open.regions)).toBeGreaterThan(0);
  });

  it('tears every limb off a shambler before a lethal blast drops it', () => {
    const session = runtime();
    const id = session.zombies.add(SHAMBLER, [1, 0, 0]);
    session.zombies.detonate(detonation([0, 1, 0], { radiusMetres: 6, damage: 1000, impulse: 1 }));
    expect(session.zombieStore.get(id)).toBeUndefined();
    const dropped = [...session.inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item.type));
    const limbs = (['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const).map((region) => SEVERED_ITEM[region]);
    expect(limbs.filter((limb) => !dropped.includes(limb))).toEqual([]);
  });
});
