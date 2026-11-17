import type { ActorDef } from '@skelly/engine/content';
import { SAVE_SCHEMA_VERSION } from '@skelly/engine/internal/core/saveFormat.ts';
import { simRate } from '@skelly/engine/internal/core/time.ts';
import type { CastResult } from '@skelly/engine/internal/game/castCommit.ts';
import { decodeSave, encodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { dominantSide, PlayerTickActions } from '@skelly/engine/sim';
import { makeScale, type Vec3, World } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { describe, expect, it, vi } from 'vitest';
import { stackActorFigureFiles, withFixtureFigures } from './baseContentFiles.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import {
  FIXTURE_ABILITY,
  FIXTURE_POOL,
  FIXTURE_VOLLEY_COUNT,
  FIXTURE_WAND,
  fixtureMagicGrants,
  fixtureMagicSource,
} from './fixtures/magic.ts';

const registry = baseRegistryWith([fixtureMagicSource()]);
const shambler = registry.actors.get('shambler')!;
const still: ActorDef = {
  ...shambler,
  id: 'fixture_still',
  speed: { ...shambler.speed, wanderMetresPerSimSecond: simRate(0), chaseMetresPerSimSecond: simRate(0) },
};
registry.actors.set(still.id, still);

const scale = makeScale(0.5);
// The caster faces +x, looking a little down so a shot meets a standing body's trunk.
const LOOK = { yaw: -Math.PI / 2, pitch: -0.15 };
const TARGET: Vec3 = [8, 1, 0];
const BEHIND: Vec3 = [11, 1, 0];
const WALL_X = 5;
const version = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: {},
  contentPacks: [{ id: 'fixture.pack', version: '1', canonicalHash: '0'.repeat(64) }],
};
const encode = (snapshot: SaveSnapshot) =>
  encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: scale.blockSize, site: 'forest', storeys: 1, density: null },
    buildRevision: 'fixture',
  });

const caster = (restore?: Readonly<SaveSnapshot>) => {
  let wall = false;
  const solid = (x: number, y: number) => y === 0 || (wall && x === WALL_X && y > 0);
  const nextTick = new PlayerTickActions();
  const results: CastResult[] = [];
  const session = createSession({
    registry,
    actorFigureFiles: withFixtureFigures(stackActorFigureFiles(registry), { [still.id]: shambler.id }),
    world: new World(),
    scale,
    seed: 71,
    start: 43_200,
    spawn: [0, 1, 0],
    ...(restore ? { restore } : {}),
    isSolid: solid,
    isOpaque: solid,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => LOOK.yaw,
      pitch: () => LOOK.pitch,
      walking: () => false,
      descending: () => false,
      // As play does, a released cast commits at the next player tick.
      sampleAtPlayerTick: (_tick, live) => {
        nextTick.applyAtNextTick();
        return live;
      },
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  const side = dominantSide(session.character);
  if (!restore) {
    session.character.initializeMagic(fixtureMagicGrants());
    if (!session.inventory.add(session.inventory.create(FIXTURE_WAND), { kind: 'hand', side })) {
      throw new Error('Fixture caster could not hold the wand');
    }
  }
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      session.frame(1 / 60);
    }
  };
  const until = (done: () => boolean, what: string) => {
    for (let frame = 0; frame < 600 && !done(); frame++) {
      frames(1);
    }
    if (!done()) {
      throw new Error(`Fixture cast never ${what}`);
    }
  };
  const { actors } = session;
  return {
    session,
    nextTick,
    add: (pos: Vec3) => actors.add(still, [...pos], [-1, 0, 0]),
    health: (id: number) => Object.values(session.actorStore.get(id)!.regions).reduce((sum, value) => sum + value, 0),
    wall: () => {
      wall = true;
    },
    cast: () => {
      if (session.beginCast(side).kind !== 'preparing') {
        throw new Error('Fixture cast did not start preparing');
      }
      until(() => session.castCharge.ready(session.sim.time), 'prepared');
      const released = session.releaseCast(LOOK, {
        enqueue: (commit) => nextTick.enqueue(commit),
        record: () => undefined,
        onResult: (result) => results.push(result),
      });
      if (!released || released.aim.x < 0.9) {
        throw new Error('Fixture cast did not release towards +x');
      }
      until(() => results.length > 0, 'committed');
      if (results[0]?.kind !== 'accepted') {
        throw new Error('Fixture cast was refused');
      }
    },
    /** One shot launched and still flying, with more of the volley to come. */
    midVolley: () => until(() => actors.castVolleys[0]?.launched === 1 && actors.castProjectiles.length === 1, 'flew'),
    flyOut: () => until(() => actors.castVolleys.length === 0 && actors.castProjectiles.length === 0, 'finished'),
  };
};

describe('cast flight', () => {
  it('refuses an already released cast, saying why, if the character loses the ability to act before its commit tick', () => {
    const { session, nextTick } = caster();
    const side = dominantSide(session.character);
    expect(session.beginCast(side).kind).toBe('preparing');
    for (let frame = 0; frame < 600 && !session.castCharge.ready(session.sim.time); frame++) {
      session.frame(1 / 60);
    }
    expect(session.castCharge.ready(session.sim.time)).toBe(true);
    const results: CastResult[] = [];
    expect(
      session.releaseCast(LOOK, {
        enqueue: (commit) => nextTick.enqueue(commit),
        record: () => undefined,
        onResult: (result) => results.push(result),
      }),
    ).toBeDefined();
    session.sim.body.impact(30, 'torso', { kind: 'blunt' });
    session.sim.body.impact(30, 'torso', { kind: 'blunt' });
    expect(session.sim.body.actionRefusal).toBeDefined();
    const before = session.character.snapshotState();
    const spends = vi.spyOn(session.character, 'spend');
    for (let frame = 0; frame < 3; frame++) {
      session.frame(1 / 60);
    }
    expect(results).toEqual([{ kind: 'refused', reason: session.sim.body.actionRefusal }]);
    expect(spends).not.toHaveBeenCalled();
    expect(session.character.snapshotState()).toEqual(before);
    expect(session.actors.castVolleys).toEqual([]);
    expect(session.actors.castProjectiles).toEqual([]);
  });

  it('wounds the first actor on the line and stops there', () => {
    const h = caster();
    const near = h.add(TARGET);
    const far = h.add(BEHIND);
    const before = { near: h.health(near), far: h.health(far) };
    h.cast();
    h.flyOut();
    expect(h.health(near)).toBeLessThan(before.near);
    expect(h.health(far)).toBe(before.far);
  });

  it('stops every shot at a wall in front of the actor', () => {
    const h = caster();
    h.wall();
    const target = h.add(TARGET);
    const before = h.health(target);
    h.cast();
    h.flyOut();
    expect(h.health(target)).toBe(before);
  });

  it('flies the whole paid volley after the source item leaves the hand', () => {
    const kept = caster();
    const dropped = caster();
    const targets = [kept, dropped].map((h) => h.add(TARGET));
    const before = kept.health(targets[0]!);
    kept.cast();
    dropped.cast();
    dropped.midVolley();
    const { inventory, body } = dropped.session;
    const wand = inventory.hands[dominantSide(dropped.session.character)]!;
    inventory.move(wand, { kind: 'pile', pos: [...body.pos] });
    kept.flyOut();
    dropped.flyOut();
    expect(kept.health(targets[0]!)).toBeLessThan(before);
    expect(dropped.health(targets[1]!)).toBe(kept.health(targets[0]!));
  });

  it('restores a save made mid-volley with a shot in flight and finishes it as the unsaved cast does, paid once', async () => {
    const original = caster();
    const target = original.add(TARGET);
    const before = original.health(target);
    const spends = vi.spyOn(original.session.character, 'spend');
    const practice = vi.spyOn(original.session.character, 'awardAbilityPractice');
    original.cast();
    original.midVolley();
    const snapshot = original.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.actors.castVolleys[0]!.launched).toBeLessThan(FIXTURE_VOLLEY_COUNT);
    const decoded = await decodeSave(await encode(snapshot), {
      version,
      contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
    });
    const restored = caster(decoded.snapshot);
    expect(restored.session.actors.snapshotState()).toEqual(original.session.actors.snapshotState());
    const restoredSpends = vi.spyOn(restored.session.character, 'spend');
    const restoredPractice = vi.spyOn(restored.session.character, 'awardAbilityPractice');
    original.flyOut();
    restored.flyOut();
    expect(original.health(target)).toBeLessThan(before);
    expect(restored.health(target)).toBe(original.health(target));
    expect(spends.mock.calls.map(([pool]) => pool)).toEqual([FIXTURE_POOL]);
    expect(practice.mock.calls).toEqual([[FIXTURE_ABILITY]]);
    expect(restoredSpends).not.toHaveBeenCalled();
    expect(restoredPractice).not.toHaveBeenCalled();
  });

  it('refuses to save or restore a volley past its last shot, leaving the session as it was', async () => {
    const h = caster();
    h.cast();
    h.midVolley();
    const snapshot = h.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    const malformed = structuredClone(snapshot);
    malformed.world.actors.castVolleys[0]!.launched = FIXTURE_VOLLEY_COUNT;
    await expect(encode(malformed)).rejects.toThrow('Invalid cast volley state');
    const before = structuredClone(h.session.actors.snapshotState());
    expect(() =>
      h.session.actors.restoreState(structuredClone(malformed.world.actors), (id) => registry.actors.get(id)),
    ).toThrow('Invalid cast volley state');
    expect(h.session.actors.snapshotState()).toEqual(before);
  });
});
