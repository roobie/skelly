import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, slidableFurniture, slideFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const base = baseRegistry();
const template = base.furniture.get('crate')!;
const registry: Registry = {
  ...base,
  furniture: new Map([
    ...base.furniture,
    [
      'slide_fixture',
      {
        ...template,
        id: 'slide_fixture',
        size: [4, 4, 2] as Vec3,
      },
    ],
  ]),
};
const spec = { type: 'slide_fixture', pos: [5, 1, 5] as Vec3, size: [4, 4, 2] as Vec3, facing: 'n' as const };
const tuning = registry.inventory.get(CORE_CONTENT_IDS.player)!.furnitureMove.slide;
const messages = registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages;
const player = () => ({ pos: [3, 1, 6] as Vec3, vel: [0, 0, 0] as Vec3, halfWidth: 0.4, height: 3.6, onGround: true });
const fixture = () => {
  const inventory = new Inventory(registry);
  const entity = inventory.furnish(spec)!;
  const mover: FurnitureMover = {
    inventory,
    player: player(),
    blockSize: 0.5,
    others: [],
    stamina: 100,
    terrainSolid: (_x, y) => y === 0,
  };
  return { inventory, entity, mover };
};

const runtime = (restore?: SaveSnapshot) => {
  const world = new World();
  const stone = registry.blockIds.get('stone')!;
  if (!restore) {
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        world.setBlock(x, 0, z, stone);
      }
    }
  }
  let walking = false;
  const solid = (x: number, y: number, z: number) => registry.blocks[world.getBlock(x, y, z)]?.solid === true;
  const session = createSession({
    registry,
    world,
    isSolid: solid,
    isOpaque: solid,
    scale: makeScale(0.5),
    seed: 7,
    start: 43_200,
    spawn: player().pos,
    ready: () => true,
    ...(restore ? { restore } : {}),
    controls: {
      active: () => true,
      intent: () => (walking ? { ...IDLE, right: 1, walk: true } : IDLE),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const advance = (seconds: number) => {
    session.sim.paused = false;
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
      session.frame(1 / 60);
    }
  };
  return {
    session,
    world,
    advance,
    setWalking: (value: boolean) => {
      walking = value;
    },
  };
};

describe('floor furniture steps', () => {
  it.each(['mount', 'door', 'climbable', 'vehicle', 'scenarioGoal', 'cover'] as const)(
    'keeps oversized content with %s out of the movement selector',
    (field) => {
      const source = [...base.furniture.values()].find((def) => Boolean(def[field]));
      expect(source).toBeDefined();
      const inventory = new Inventory({
        ...registry,
        furniture: new Map(registry.furniture).set('slide_fixture', {
          ...source!,
          id: 'slide_fixture',
          size: spec.size,
        }),
      });
      const entity = inventory.furnish(spec)!;
      expect(entity).toBeDefined();
      expect(slidableFurniture(inventory, entity, 0.5)).toBe(false);
    },
  );

  it.each(['push', 'drag'] as const)(
    'finishes one timed %s step with stamina and audible noise, without occupying hands',
    (way) => {
      const { session, advance } = runtime();
      const entity = session.inventory.furnish(spec)!;
      const before = session.sim.needs.stamina;
      expect(session.slideFurniture(entity.uid, way)).toBeUndefined();
      advance(tuning.stepSimSeconds / 2);
      expect(entity.pos).toEqual(spec.pos);
      advance(tuning.stepSimSeconds / 2);
      expect(entity.pos).toEqual([way === 'push' ? 6 : 4, 1, 5]);
      expect(session.sim.needs.stamina).toBeLessThan(before);
      expect(session.playerAudio.vocalNoise?.radiusMetres).toBeGreaterThan(
        registry.sounds.get('furniture_scrape')!.noise.radiusMetres,
      );
      expect(session.entities.carrying()).toBeUndefined();
      expect(session.entities.isSolid(...entity.pos)).toBe(true);
      const vacated: Vec3 = [way === 'push' ? 5 : 8, 1, 5];
      expect(session.entities.isSolid(...vacated)).toBe(false);
    },
  );

  it('refuses a blocked step atomically, including a wall added while the action is underway', () => {
    const { session, world, advance } = runtime();
    const entity = session.inventory.furnish(spec)!;
    expect(session.slideFurniture(entity.uid, 'push')).toBeUndefined();
    world.setBlock(9, 1, 5, registry.blockIds.get('stone')!);
    advance(tuning.stepSimSeconds);
    expect(entity.pos).toEqual(spec.pos);
    expect(session.playerAudio.vocalNoise).toBeUndefined();
    expect(session.slideFurniture(entity.uid, 'push')).toBe(messages.noRoom);
    expect(session.queue.busy).toBe(false);
  });

  it.each(['hole', 'step'] as const)('refuses a %s in the destination floor', (obstacle) => {
    const { entity, mover } = fixture();
    const terrainSolid = (x: number, y: number, z: number) =>
      (y === 0 && !(obstacle === 'hole' && x === 9 && z === 5)) ||
      (obstacle === 'step' && x === 9 && y === 1 && z === 5);
    expect(slideFurniture({ ...mover, terrainSolid }, entity, 'push')).toBe(
      obstacle === 'hole' ? messages.floorOnly : messages.noRoom,
    );
    expect(entity.pos).toEqual(spec.pos);
  });

  it('refuses fastened pieces, carry-sized pieces, exhaustion and destinations occupied by a body', () => {
    const { entity, inventory, mover } = fixture();
    const fixed = inventory.furnish({ ...spec, pos: [5, 1, 10], fixed: true })!;
    expect(slidableFurniture(inventory, entity, mover.blockSize)).toBe(true);
    expect(slidableFurniture(inventory, fixed, mover.blockSize)).toBe(true);
    expect(slideFurniture(mover, fixed, 'push')).toBe(messages.fastened);
    const small = inventory.furnish({ type: template.id, pos: [5, 1, 12], size: [1, 1, 1], facing: 'n' })!;
    expect(slidableFurniture(inventory, small, mover.blockSize)).toBe(false);
    expect(slideFurniture(mover, small, 'push')).toBe(messages.carryInstead);
    expect(slideFurniture({ ...mover, stamina: 0 }, entity, 'push')).toBe(messages.slideTired);
    expect(slideFurniture({ ...mover, others: [{ ...player(), pos: [9.5, 1, 6] }] }, entity, 'push')).toBe(
      messages.otherInWay,
    );
  });

  it('settles unsupported pieces and loose items once, leaving a partly supported stack in place', () => {
    const { inventory, entity, mover } = fixture();
    const top = inventory.furnish({ ...spec, pos: [5, 5, 5], size: [1, 1, 1] })!;
    const supported = inventory.furnish({ ...spec, pos: [7, 5, 5], size: [1, 1, 1] })!;
    const item = inventory.create('canned_beans');
    expect(inventory.add(item, { kind: 'pile', pos: [5, 6, 5] })).toBe(true);
    expect(slideFurniture(mover, entity, 'push')).toBeUndefined();
    expect(top.pos).toEqual([5, 1, 5]);
    expect(supported.pos).toEqual([7, 5, 5]);
    expect(inventory.pileAt([5, 2, 5])?.items.some((placed) => placed.item === item)).toBe(true);
  });

  it('notifies relocation owners before a committed slide and stack fall, never for a preview or refusal', () => {
    const { inventory, entity, mover } = fixture();
    const top = inventory.furnish({ ...spec, pos: [5, 5, 5], size: [1, 1, 1] })!;
    const relocated: number[] = [];
    const moving = {
      ...mover,
      beforeRelocate: (piece: typeof entity) => {
        expect(entity.pos).toEqual(spec.pos);
        expect(top.pos).toEqual([5, 5, 5]);
        relocated.push(piece.uid);
      },
    };
    expect(slideFurniture(moving, entity, 'push', { commit: false })).toBeUndefined();
    expect(slideFurniture({ ...moving, stamina: 0 }, entity, 'push')).toBe(messages.slideTired);
    expect(relocated).toEqual([]);
    expect(slideFurniture(moving, entity, 'push')).toBeUndefined();
    expect(relocated).toEqual([entity.uid, top.uid]);
  });

  it('round-trips a completed step between actions and can drag the restored piece back', async () => {
    const { session, advance } = runtime();
    const entity = session.inventory.furnish(spec)!;
    expect(session.slideFurniture(entity.uid, 'push')).toBeUndefined();
    advance(tuning.stepSimSeconds);
    const snapshot = session.snapshot({ worldId: 'slide-world', characterId: 'slide-character' });
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id) => contentLookup(registry, kind, id),
    });
    const loaded = runtime(decoded.snapshot);
    const restored = loaded.session.entities.byUid(entity.uid)!;
    expect(restored.pos).toEqual([6, 1, 5]);
    expect(loaded.session.entities.at(6, 1, 5)).toBe(restored);
    expect(loaded.session.inventory.furnish(spec)).toBeUndefined();
    // Walk into reach between steps, as a player does after pushing away.
    loaded.setWalking(true);
    for (let frame = 0; frame < 60 && loaded.session.body.pos[0] < 4; frame++) {
      loaded.advance(1 / 60);
    }
    loaded.setWalking(false);
    expect(loaded.session.slideFurniture(restored.uid, 'drag')).toBeUndefined();
    loaded.advance(tuning.stepSimSeconds);
    expect(restored.pos).toEqual(spec.pos);
  });
});
