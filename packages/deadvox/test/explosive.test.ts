import { readFileSync } from 'node:fs';
import { Mesh, PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { dominantSide } from '../src/core/character.ts';
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
import { ZOMBIE_REGION_NAMES } from '../src/core/zombieRegionNames.ts';
import type { ZombieRegions } from '../src/core/zombieRegions.ts';
import type { Detonation } from '../src/core/zombies.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { HeldItems } from '../src/render/hands.ts';
import { itemLook } from '../src/render/itemLook.ts';
import { ModelLibrary } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';
import type { MoveIntent } from './playerFixture.ts';

const registry = baseRegistry();
const MODEL_ROOT = 'src/content/base';
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

const runtime = (
  isSolid: SolidAt = OPEN,
  restore?: Readonly<SaveSnapshot>,
  content = registry,
  {
    onDetonation,
    onFuseLit,
    intent,
  }: {
    onDetonation?: (position: Vec3, radiusMetres: number) => void;
    onFuseLit?: (item: Item) => void;
    intent?: () => MoveIntent;
  } = {},
) =>
  createSession({
    registry: content,
    world: new World(),
    isSolid,
    isOpaque: () => false,
    scale: makeScale(BLOCK),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => true,
    controls: {
      active: () => intent !== undefined,
      intent: intent ?? (() => IDLE),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(onDetonation ? { onDetonation } : {}),
    ...(onFuseLit ? { onFuseLit } : {}),
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
  it('detonates a lit grenade after release has committed it to the pile', () => {
    const detonations: Vec3[] = [];
    const session = runtime(OPEN, undefined, registry, { onDetonation: (position) => detonations.push(position) });
    const grenade = session.inventory.create(GRENADE);
    expect(session.inventory.add(grenade, { kind: 'hand', side: 'right' })).toBe(true);
    expect(session.fuses.togglePin(grenade)).toBe('pulled');
    const target = { kind: 'pile' as const, pos: [2, 0, 0] as [number, number, number] };
    expect(session.throwCharge.place(grenade, 'right', target).landed).toBe(true);
    expect(session.inventory.locate(grenade)).toMatchObject({ kind: 'pile', pile: { pos: target.pos } });

    session.sim.scheduler.advance(FUSE + 0.5);
    expect(detonations).toEqual([[(target.pos[0] + 0.5) * BLOCK, 0.25 * BLOCK, (target.pos[2] + 0.5) * BLOCK]]);
    expect(session.inventory.itemByUid(grenade.uid)).toBeUndefined();
  });

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

  it('sheds its lever once, when release lights its fuse, and is drawn without it from then on', () => {
    const lit: Item[] = [];
    const session = runtime(OPEN, undefined, registry, { onFuseLit: (item) => lit.push(item) });
    const { piece } = registry.models.get(registry.items.get(GRENADE)!.model!)!.lever!;
    const shed = (item: Item) => itemLook(registry, item)?.hidden.includes(piece);
    const grenade = liveInHand(session);
    session.sim.scheduler.advance(FUSE / 4);
    expect([lit, shed(grenade)]).toEqual([[], false]);

    const { version: before } = session.inventory;
    expect(session.inventory.move(grenade, { kind: 'pile', pos: [1, 0, 0] }).ok).toBe(true);
    session.sim.scheduler.advance(FUSE / 4);
    expect(lit).toEqual([grenade]);
    expect(shed(grenade)).toBe(true);
    expect(session.inventory.version).toBeGreaterThan(before);
    session.sim.scheduler.advance(FUSE / 4);
    expect(lit).toEqual([grenade]);
  });

  it('is redrawn in the hand without its pin while the pin is out, and with it once the pin goes back in', async () => {
    const session = runtime();
    const model = registry.items.get(GRENADE)!.model!;
    const def = registry.models.get(model)!;
    const { piece } = def.pin!;
    const loads: Promise<void>[] = [];
    const spy = vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((path, onLoad, _onProgress, onError) => {
      loads.push(new GLTFLoader().parseAsync(Uint8Array.from(readFileSync(path)).buffer, '').then(onLoad, onError));
    });
    const models = new ModelLibrary(
      { ...registry, models: new Map([[model, def]]) },
      (message) => {
        throw new Error(message);
      },
      { [def.file]: `${MODEL_ROOT}/${def.file}` },
    );
    spy.mockRestore();
    await Promise.all(loads);
    const held = new HeldItems(session.inventory, models, registry.figures.get('player')!.palette);
    const camera = new PerspectiveCamera();
    const pinMeshesDrawn = () => {
      held.update(camera);
      let drawn = 0;
      held.warmUpTarget.scene.traverseVisible((child) => {
        if (child instanceof Mesh && child.geometry.userData.piece === piece) {
          drawn += 1;
        }
      });
      return drawn;
    };
    const grenade = session.inventory.create(GRENADE);
    expect(session.inventory.add(grenade, { kind: 'hand', side: 'right' })).toBe(true);
    const drawn = [pinMeshesDrawn()];
    session.fuses.togglePin(grenade);
    drawn.push(pinMeshesDrawn());
    session.fuses.togglePin(grenade);
    drawn.push(pinMeshesDrawn());
    held.dispose();
    expect(drawn[0]).toBeGreaterThan(0);
    expect(drawn.slice(1)).toEqual([0, drawn[0]]);
    session.fuses.togglePin(grenade);
    expect(session.inventory.move(grenade, { kind: 'pile', pos: [1, 0, 0] }).ok).toBe(true);
    session.sim.scheduler.advance(FUSE / 4);
    expect(itemLook(registry, grenade)!.hidden.includes(piece)).toBe(true);
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

  it('goes off with the player carrying the piece it is in, not where the piece was lifted', () => {
    const detonations: Vec3[] = [];
    let walking = false;
    const session = runtime(OPEN, undefined, registry, {
      onDetonation: (position) => detonations.push(position),
      intent: () => (walking ? { ...IDLE, forward: 1 } : IDLE),
    });
    const crate = registry.furniture.get('crate')!;
    const site: Vec3 = [2, 0, 0];
    const piece = session.inventory.furnish({ type: crate.id, pos: site, size: crate.size, facing: 'n' })!;
    expect(session.search(piece)).toBeUndefined();
    session.sim.scheduler.advance(30);
    expect(piece.searched).toBe(true);
    const grenade = liveInHand(session);
    expect(session.inventory.move(grenade, { kind: 'furniture', entity: piece, pocket: 0 }).ok).toBe(true);
    expect(session.liftFurniture(piece.uid)).toBeUndefined();

    walking = true;
    session.sim.scheduler.advance(FUSE / 2);
    walking = false;
    session.sim.scheduler.advance(0.5);
    const [x, , z] = session.body.pos;
    session.sim.scheduler.advance(FUSE);

    expect(session.inventory.itemByUid(grenade.uid)).toBeUndefined();
    expect(detonations).toHaveLength(1);
    const [at] = detonations;
    expect(Math.hypot(x - (site[0] + 0.5), z - (site[2] + 0.5))).toBeGreaterThan(crate.size[0] * 2);
    expect([at![0] / BLOCK, at![2] / BLOCK]).toEqual([expect.closeTo(x, 3), expect.closeTo(z, 3)]);
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
    const type = {
      ...SHAMBLER,
      id: 'fixture_parts',
      severedItems: { ...SHAMBLER.severedItems, leftArm: 'rag', rightLeg: null } as typeof SHAMBLER.severedItems,
    };
    const id = session.zombies.add(type, [1, 0, 0]);
    session.zombies.detonate(detonation([0, 1, 0], { radiusMetres: 6, damage: 1000, impulse: 1 }));
    expect(session.zombieStore.get(id)).toBeUndefined();
    const dropped = [...session.inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item.type));
    const limbs = (['leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const)
      .map((region) => type.severedItems[region])
      .filter((item) => item !== null);
    expect(limbs.filter((limb) => !dropped.includes(limb!))).toEqual([]);
    expect(dropped).not.toContain(SHAMBLER.severedItems.rightLeg);
  });
});
