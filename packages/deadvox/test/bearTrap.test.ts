import { describe, expect, it, vi } from 'vitest';
import { BearTraps } from '../src/core/bearTrap.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ItemDef, ZombieDef } from '../src/core/schema.ts';
import { simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { WORLD_REGION_METRES } from '../src/core/worldRegion.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';

const base = startupContent().registry;
const trapDef: ItemDef = {
  id: 'fixture_trap',
  name: 'Fixture trap',
  category: 'tool',
  weight: 1000,
  size: [2, 2],
  economy: { usage: [], tiers: [] },
  trap: {
    setSimSeconds: simSeconds(1),
    disarmSimSeconds: simSeconds(2),
    holdSimSeconds: simSeconds(3),
    playerInjury: { region: 'leftLeg', damage: 5, kind: 'pierce' },
    zombieLegDamage: 4,
  },
};
const walker: ZombieDef = { ...base.zombies.get('shambler')!, id: 'fixture_walker' };
const content = {
  ...base,
  items: new Map(base.items).set(trapDef.id, trapDef),
  zombies: new Map(base.zombies).set(walker.id, walker),
};
const scale = makeScale(0.5);
const FRAME = 1 / 60;

const runtime = (restore?: Readonly<SaveSnapshot>) => {
  let intent = IDLE;
  const session = createSession({
    registry: content,
    world: new World(),
    scale,
    seed: 5,
    start: 43_200,
    spawn: [0.5, 1, 0.5],
    ...(restore ? { restore } : {}),
    isSolid: (_x: number, y: number) => y === 0,
    isOpaque: (_x: number, y: number) => y === 0,
    ready: () => true,
    controls: {
      active: () => true,
      blocking: () => false,
      intent: () => intent,
      yaw: () => -Math.PI / 2,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  const hits = vi.spyOn(session.sim, 'hit');
  const run = (seconds: number) => {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += FRAME) {
      session.frame(FRAME);
    }
  };
  /** Lays a set trap on the ground at a cell, as setting one leaves it. */
  const lay = (pos: Vec3): Item => {
    const trap = session.inventory.create(trapDef.id);
    if (!session.inventory.add(trap, { kind: 'pile', pos })) {
      throw new Error('Fixture trap does not fit on the ground');
    }
    trap.trap = { state: 'armed' };
    return trap;
  };
  const walk = (moving: boolean) => {
    intent = moving ? { ...IDLE, forward: 1 } : IDLE;
  };
  return { session, hits, run, lay, walk };
};

const roundTrip = async (snapshot: Readonly<SaveSnapshot>): Promise<SaveSnapshot> => {
  const version = {
    simulationHash: 'a'.repeat(64),
    schemaVersion: SAVE_SCHEMA_VERSION,
    generators: {},
    contentPacks: [{ id: 'fixture.pack', version: '1', canonicalHash: '0'.repeat(64) }],
  };
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: scale.blockSize, site: 'forest', storeys: 1, density: null },
    buildRevision: 'fixture',
  });
  return (await decodeSave(bytes, { version, contentLookup: () => true })).snapshot;
};

describe('bear trap', () => {
  it('springs on a zombie that walks into its cell, which does not steer around it', () => {
    const h = runtime();
    const trap = h.lay([3, 1, 0]);
    const id = h.session.zombies.add(walker, [6.5, 1, 0.5], [-1, 0, 0]);
    const zombie = h.session.zombieStore.get(id)!;
    const legs = Object.values(zombie.regions).reduce((sum, health) => sum + health, 0);
    for (let step = 0; step < 600 && trap.trap?.state === 'armed'; step++) {
      h.run(FRAME);
    }
    expect(trap.trap).toMatchObject({ state: 'holding', zombie: id });
    expect(Object.values(zombie.regions).reduce((sum, health) => sum + health, 0)).toBeLessThan(legs);
    const held = [...zombie.body.pos];
    h.run(trapDef.trap!.holdSimSeconds / 2);
    expect([zombie.body.pos[0], zombie.body.pos[2]]).toEqual([held[0], held[2]]);
  });

  it('restrains and injures the player who steps in it', () => {
    const h = runtime();
    const trap = h.lay([0, 1, 0]);
    h.run(0.1);
    expect(trap.trap).toMatchObject({ state: 'holding' });
    expect(trap.trap).not.toHaveProperty('zombie');
    const { region, damage, kind } = trapDef.trap!.playerInjury;
    expect(h.hits).toHaveBeenCalledWith(damage, expect.any(String), region, { kind });
    const pos = [...h.session.body.pos];
    h.walk(true);
    h.run(trapDef.trap!.holdSimSeconds / 2);
    expect(h.session.body.pos).toEqual(pos);
  });

  it('discards an interrupted disarm, so the next attempt takes the full duration', () => {
    const h = runtime();
    const trap = h.lay([1, 1, 0]);
    const { disarmSimSeconds } = trapDef.trap!;
    expect(h.session.survival.use(trap)).toBeUndefined();
    h.run(disarmSimSeconds * 0.75);
    h.session.sim.hit(1, 'fixture', 'torso');
    h.run(FRAME * 2);
    expect(h.session.survival.use(trap)).toBeUndefined();
    h.run(disarmSimSeconds * 0.75);
    expect(trap.trap).toEqual({ state: 'armed' });
    h.run(disarmSimSeconds * 0.5);
    expect(trap.trap).toBeUndefined();
  });

  it('never springs on a valid disarm', () => {
    const h = runtime();
    const trap = h.lay([1, 1, 0]);
    expect(h.session.survival.use(trap)).toBeUndefined();
    h.run(trapDef.trap!.disarmSimSeconds + 0.1);
    expect(trap.trap).toBeUndefined();
    expect(h.hits).not.toHaveBeenCalled();
    const id = h.session.zombies.add(walker, [1.5, 1, 0.5], [-1, 0, 0]);
    h.run(0.1);
    expect(trap.trap).toBeUndefined();
    expect(h.session.zombies.store.get(id)).toBeDefined();
  });

  it('sets, disarms and recovers the one trap item', () => {
    const h = runtime();
    const trap = h.session.inventory.create(trapDef.id);
    expect(h.session.inventory.add(trap, { kind: 'hand', side: 'right' })).toBe(true);
    expect(h.session.survival.use(trap)).toBeUndefined();
    h.run(trapDef.trap!.setSimSeconds + 0.1);
    expect(h.session.inventory.locate(trap)?.kind).toBe('pile');
    expect(trap.trap).toEqual({ state: 'armed' });
    expect(h.session.inventory.move(trap, { kind: 'hand', side: 'right' }).ok).toBe(false);
    expect(h.session.survival.use(trap)).toBeUndefined();
    h.run(trapDef.trap!.disarmSimSeconds + 0.1);
    expect(h.session.inventory.move(trap, { kind: 'hand', side: 'right' }).ok).toBe(true);
    const traps = [...h.session.inventory.items()].filter(({ item }) => item.type === trapDef.id);
    expect(traps.map(({ item }) => item)).toEqual([trap]);
  });

  it('keeps a set trap armed and a held player restrained across save and load', async () => {
    const original = runtime();
    const armed = original.lay([4, 1, 0]);
    const holding = original.lay([0, 1, 0]);
    original.run(0.1);
    expect(holding.trap?.state).toBe('holding');
    const restored = runtime(
      await roundTrip(original.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' })),
    );
    const restoredTrap = (uid: number) => restored.session.inventory.itemByUid(uid)?.trap;
    expect(restoredTrap(armed.uid)).toEqual(armed.trap);
    expect(restoredTrap(holding.uid)).toEqual(holding.trap);
    const pos = [...restored.session.body.pos];
    restored.walk(true);
    restored.run(0.5);
    expect(restored.session.body.pos).toEqual(pos);
  });
});

describe('bear trap horizon', () => {
  it('keeps a trap beyond the block around the player armed, with nothing springing it', () => {
    const inventory = new Inventory(content);
    const farX = (3 * WORLD_REGION_METRES) / scale.blockSize;
    const pos: Vec3 = [farX, 1, 0];
    const trap = inventory.create(trapDef.id);
    expect(inventory.add(trap, { kind: 'pile', pos })).toBe(true);
    trap.trap = { state: 'armed' };
    const traps = new BearTraps(inventory);
    const injureZombie = vi.fn();
    const contacts = (player: Vec3) => ({
      player,
      zombies: [[7, [farX + 0.5, 1, 0.5]] as const],
      blockSize: scale.blockSize,
      alive: () => true,
      hurtPlayer: vi.fn(),
      injureZombie,
    });
    expect(traps.step(1, contacts([0.5, 1, 0.5]))).toEqual([]);
    expect(trap.trap).toEqual({ state: 'armed' });
    expect(injureZombie).not.toHaveBeenCalled();
    traps.step(1, contacts([farX - 10, 1, 0.5]));
    expect(trap.trap).toMatchObject({ state: 'holding', zombie: 7 });
  });
});
