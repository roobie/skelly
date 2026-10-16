import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
// biome-ignore lint/performance/noNamespaceImport: The spy must observe the actual melee block boundary.
import * as meleeCombat from '../src/core/meleeCombat.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ZombieDef } from '../src/core/schema.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import type { AcidGroundImpact } from '../src/core/zombies.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { startupContent } from './baseRegistry.ts';

const base = startupContent().registry;
const template = base.zombies.get('acid_zombie')!;
const spitter: ZombieDef = {
  ...template,
  id: 'fixture_spitter',
  acidSpit: {
    ...template.acidSpit!,
    windupSimSeconds: simSeconds(0.1),
    cooldownSimSeconds: simSeconds(30),
    rangeBand: { nearMetres: 1, farMetres: 20 },
    spreadDegrees: 0,
    globMetresPerSimSecond: simRate(8),
    globGravityMetresPerSimSecondSquared: 4,
    moves: [
      {
        id: 'fixture_burn',
        weight: 1,
        damage: 3,
        damageKind: 'acid',
        hitRegions: [
          { region: 'leftArm', weight: 1 },
          { region: 'torso', weight: 2 },
        ],
      },
    ],
  },
};
const shambler: ZombieDef = { ...base.zombies.get('shambler')!, id: 'fixture_shambler' };
const resistant: ZombieDef = { ...shambler, id: 'fixture_resistant', acidResistance: 1 };
const spreadSpitter: ZombieDef = {
  ...spitter,
  id: 'fixture_spread',
  acidSpit: { ...spitter.acidSpit!, spreadDegrees: 12 },
};
const content = {
  ...base,
  zombies: new Map([
    ...base.zombies,
    ...[spitter, shambler, resistant, spreadSpitter].map((type) => [type.id, type] as const),
  ]),
};
const scale = makeScale(0.5);
const ORIGIN: Vec3 = [12, 1, 0];

const runtime = (restore?: Readonly<SaveSnapshot>, seed = 71, blocking = false) => {
  let wall = false;
  let moving = false;
  const impacts: Vec3[] = [];
  const ground: AcidGroundImpact[] = [];
  const solid = (x: number, y: number) => y === 0 || (wall && x === 6 && y > 0);
  const session = createSession({
    registry: content,
    world: new World(),
    scale,
    seed,
    start: 43_200,
    spawn: [0, 1, 0],
    ...(restore ? { restore } : {}),
    isSolid: solid,
    isOpaque: solid,
    ready: () => true,
    controls: {
      active: () => true,
      blocking: () => blocking,
      intent: () => (moving ? { ...IDLE, forward: 1 } : IDLE),
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
    onAcidImpact: (pos) => impacts.push(pos),
    onAcidGroundImpact: (impact) => ground.push(impact),
  });
  session.sim.paused = false;
  const hits = vi.spyOn(session.sim, 'hit');
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      session.frame(1 / 60);
    }
  };
  const release = (type = spitter) => {
    const source = session.zombies.add(type, [...ORIGIN], [-1, 0, 0]);
    for (let frame = 0; frame < 120 && session.zombies.acidGlobs.length === 0; frame++) {
      frames(1);
    }
    if (session.zombies.acidGlobs.length !== 1 || hits.mock.calls.length > 0) {
      throw new Error('Fixture did not release one in-flight glob without a hit');
    }
    return source;
  };
  const land = () => {
    for (let frame = 0; frame < 300 && session.zombies.acidGlobs.length > 0; frame++) {
      frames(1);
    }
    if (session.zombies.acidGlobs.length > 0 || impacts.length !== 1) {
      throw new Error('Fixture glob did not land exactly once');
    }
  };
  return {
    session,
    hits,
    impacts,
    ground,
    frames,
    release,
    land,
    wall: () => {
      wall = true;
    },
    sidestep: () => {
      moving = true;
    },
  };
};

describe('acid glob', () => {
  it('stops at a solid added after release before it can hit the player', () => {
    const h = runtime();
    h.release();
    h.wall();
    h.land();
    expect(h.hits).not.toHaveBeenCalled();
    expect(h.ground).toHaveLength(0);
  });

  it.each([shambler, resistant])(
    'a body stops the glob and takes only the burn its resistance allows ($id)',
    (type) => {
      const h = runtime();
      h.release();
      const id = h.session.zombies.add(type, [6, 1, 0], [-1, 0, 0]);
      const zombie = h.session.zombieStore.get(id)!;
      const before = { ...zombie.regions };
      h.land();
      expect(h.hits).not.toHaveBeenCalled();
      const lost = Object.entries(before).reduce((sum, [region, health]) => sum + health - zombie.regions[region]!, 0);
      if (type.acidResistance === 1) {
        expect(lost).toBe(0);
      } else {
        expect(lost).toBeGreaterThan(0);
      }
    },
  );

  it('routes a glob through localized player damage and wear even while blocking', () => {
    const h = runtime(undefined, 71, true);
    const jacket = h.session.inventory.create('jacket');
    expect(h.session.inventory.add(jacket, { kind: 'worn' })).toBe(true);
    const { condition } = jacket;
    const practice = { ...h.session.character.practice };
    h.release();
    const block = vi.spyOn(meleeCombat, 'blocksAttack');
    h.land();
    expect(block).not.toHaveBeenCalled();
    block.mockRestore();
    expect(h.session.character.practice).toEqual(practice);
    expect(jacket.condition).toBeLessThan(condition);
    expect(h.hits).toHaveBeenCalledTimes(1);
    const [damage, , region, effects] = h.hits.mock.calls[0]!;
    expect(damage).toBeGreaterThan(0);
    expect(spitter.acidSpit!.moves[0]!.hitRegions.map((choice) => choice.region)).toContain(region);
    expect(effects).toEqual({ kind: 'acid' });
    expect(h.session.sim.body.pain.felt).toBeGreaterThan(0);
  });

  it('lets the player leave the released aim and emits a ground-impact seam instead', () => {
    const h = runtime();
    h.release();
    h.sidestep();
    h.land();
    expect(h.hits).not.toHaveBeenCalled();
    expect(h.ground).toHaveLength(1);
    expect(h.ground[0]!.puddle).toEqual(spitter.acidSpit!.puddle);
  });

  it('produces the same seeded aim on independent runs', () => {
    const first = runtime();
    const second = runtime();
    first.release(spreadSpitter);
    second.release(spreadSpitter);
    expect(first.session.zombies.acidGlobs).toEqual(second.session.zombies.acidGlobs);
  });

  it('round-trips an in-flight glob through the disk format and lands identically', async () => {
    const original = runtime();
    original.release();
    original.frames(4);
    const snapshot = original.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.zombies.acidGlobs).toHaveLength(1);
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
    const decoded = await decodeSave(bytes, { version, contentLookup: () => true });
    const restored = runtime(decoded.snapshot);
    expect(restored.session.zombies.acidGlobs).toEqual(original.session.zombies.acidGlobs);
    original.land();
    restored.land();
    expect(original.hits).toHaveBeenCalledTimes(1);
    expect(restored.hits.mock.calls).toEqual(original.hits.mock.calls);
    expect(restored.impacts).toEqual(original.impacts);
    expect(restored.session.sim.body.snapshotState()).toEqual(original.session.sim.body.snapshotState());
  });
});
