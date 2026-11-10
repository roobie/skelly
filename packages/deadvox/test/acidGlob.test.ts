import { describe, expect, it, vi } from 'vitest';
import type { AcidGroundImpact } from '../src/core/actorSystem.ts';
// biome-ignore lint/performance/noNamespaceImport: The spy must observe the actual melee block boundary.
import * as meleeCombat from '../src/core/meleeCombat.ts';
import { SAVE_SCHEMA_VERSION } from '../src/core/saveFormat.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import type { ActorDef } from '../src/engine/content.ts';
import { decodeSave, encodeSave, type SaveSnapshot } from '../src/engine/save.ts';
import { BODY_REGIONS, type BodyRegion } from '../src/engine/sim.ts';
import { makeScale, type Vec3, World } from '../src/engine/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { stackActorFigureFiles, withFixtureFigures } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';

const base = startupContent().registry;
const template = base.actors.get('acid_zombie')!;
const spitter: ActorDef = {
  ...template,
  id: 'fixture_spitter',
  acidSpit: {
    ...template.acidSpit!,
    windupSimSeconds: simSeconds(0.1),
    cooldownSimSeconds: simSeconds(30),
    rangeBand: { nearMetres: 1, farMetres: 20 },
    spreadDegrees: 0,
    globMetresPerSimSecond: simRate(8),
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
const shambler: ActorDef = {
  ...base.actors.get('shambler')!,
  id: 'fixture_shambler',
  speed: {
    ...base.actors.get('shambler')!.speed,
    wanderMetresPerSimSecond: simRate(0),
    chaseMetresPerSimSecond: simRate(0),
  },
};
const resistant: ActorDef = {
  ...shambler,
  id: 'fixture_resistant',
  damageResistance: {
    [spitter.acidSpit!.moves[0]!.damageKind]: Object.fromEntries(BODY_REGIONS.map((region) => [region, 1])) as Record<
      BodyRegion,
      number
    >,
  },
};
const spreadSpitter: ActorDef = {
  ...spitter,
  id: 'fixture_spread',
  acidSpit: { ...spitter.acidSpit!, spreadDegrees: 12 },
};
const content = {
  ...base,
  actors: new Map([
    ...base.actors,
    ...[spitter, shambler, resistant, spreadSpitter].map((type) => [type.id, type] as const),
  ]),
};
const scale = makeScale(0.5);
const ORIGIN: Vec3 = [12, 1, 0];

const runtime = (
  restore?: Readonly<SaveSnapshot>,
  seed = 71,
  blocking = false,
  {
    woundFixture = false,
    gravityMetresPerSimSecondSquared,
  }: { woundFixture?: boolean; gravityMetresPerSimSecondSquared?: number } = {},
) => {
  let wall = false;
  let moving = false;
  let yaw = 0;
  const impacts: Vec3[] = [];
  const ground: AcidGroundImpact[] = [];
  const solid = (x: number, y: number) => y === 0 || (wall && x === 6 && y > 0);
  const registry = {
    ...content,
    ...(woundFixture
      ? {
          body: new Map(
            [...content.body].map(([id, body]) => [
              id,
              {
                ...body,
                bleeding: {
                  ...body.bleeding,
                  tiers: body.bleeding.tiers.map((tier) => ({
                    ...tier,
                    chancePerDamage: { ...tier.chancePerDamage, acid: 1 },
                  })),
                },
              },
            ]),
          ),
        }
      : {}),
    ...(gravityMetresPerSimSecondSquared === undefined
      ? {}
      : {
          player: new Map(
            [...content.player].map(([id, player]) => [id, { ...player, gravityMetresPerSimSecondSquared }]),
          ),
        }),
  };
  const session = createSession({
    registry,
    actorFigureFiles: withFixtureFigures(stackActorFigureFiles(registry), {
      [spitter.id]: template.id,
      [spreadSpitter.id]: template.id,
      [shambler.id]: 'shambler',
      [resistant.id]: 'shambler',
    }),
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
      yaw: () => yaw,
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
  const burns = vi.spyOn(session.sim.body, 'impact');
  const frames = (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      session.frame(1 / 60);
    }
  };
  const release = (type = spitter) => {
    const source = session.actors.add(type, [...ORIGIN], [-1, 0, 0]);
    for (let frame = 0; frame < 120 && session.actors.acidGlobs.length === 0; frame++) {
      frames(1);
    }
    if (session.actors.acidGlobs.length !== 1 || hits.mock.calls.length > 0) {
      throw new Error('Fixture did not release one in-flight glob without a hit');
    }
    return source;
  };
  const land = () => {
    for (let frame = 0; frame < 300 && session.actors.acidGlobs.length > 0; frame++) {
      frames(1);
    }
    if (session.actors.acidGlobs.length > 0 || impacts.length !== 1) {
      throw new Error('Fixture glob did not land exactly once');
    }
  };
  return {
    session,
    hits,
    burns,
    impacts,
    ground,
    frames,
    release,
    land,
    walkTo: (target: Vec3) => {
      moving = true;
      for (let frame = 0; frame < 300; frame++) {
        const [x, , z] = session.body.pos;
        if (Math.hypot(target[0] - x, target[2] - z) < spitter.acidSpit!.puddle.radiusMetres / scale.blockSize / 4) {
          moving = false;
          return;
        }
        yaw = Math.atan2(x - target[0], z - target[2]);
        frames(1);
      }
      throw new Error('Fixture player did not reach target');
    },
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
      const id = h.session.actors.add(type, [2, 1, 0], [-1, 0, 0]);
      const actor = h.session.actorStore.get(id)!;
      const before = { ...actor.regions };
      h.land();
      expect(h.hits.mock.calls.filter(([, , , hit]) => hit?.kind === 'acid')).toHaveLength(0);
      const lost = Object.entries(before).reduce((sum, [region, health]) => sum + health - actor.regions[region]!, 0);
      if (type === resistant) {
        expect(lost).toBe(0);
      } else {
        expect(lost).toBeGreaterThan(0);
      }
    },
  );

  it('uses changed fixture gravity for an in-flight glob', () => {
    const light = runtime();
    const heavy = runtime(undefined, 71, false, {
      gravityMetresPerSimSecondSquared: base.player.get('player')!.gravityMetresPerSimSecondSquared * 2,
    });
    light.release();
    heavy.release();
    const [, lightVelocity] = light.session.actors.acidGlobs[0]!.velocity;
    const [, heavyVelocity] = heavy.session.actors.acidGlobs[0]!.velocity;
    light.frames(10);
    heavy.frames(10);
    expect(heavy.session.actors.acidGlobs[0]!.velocity[1] - heavyVelocity).toBeLessThan(
      light.session.actors.acidGlobs[0]!.velocity[1] - lightVelocity,
    );
  });

  it('routes a glob through localized player damage and wear even while blocking', () => {
    const h = runtime(undefined, 71, true);
    const jacket = h.session.inventory.create('jacket');
    expect(h.session.inventory.add(jacket, { kind: 'worn' })).toBe(true);
    const { condition } = jacket;
    const practice = { ...h.session.character.practice };
    h.release();
    const block = vi.spyOn(meleeCombat, 'meleeBlock');
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

  it('names the spitter by its content cause on a glob hit and in a puddle', () => {
    const hit = runtime(undefined, 71, true);
    hit.release();
    hit.land();
    expect(hit.hits.mock.calls.map((call) => call[1])).toEqual([spitter.cause]);

    const h = missedSpit();
    const contacts = vi.spyOn(h.session.sim, 'expose');
    h.walkTo(h.session.actors.acidPuddles[0]!.pos);
    h.frames(6);
    expect(contacts).toHaveBeenCalled();
    expect(new Set(contacts.mock.calls.map(([contact]) => contact.cause))).toEqual(new Set([spitter.cause]));
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
    expect(first.session.actors.acidGlobs).toEqual(second.session.actors.acidGlobs);
  });

  it('round-trips an in-flight glob through the disk format and lands identically', async () => {
    const original = runtime();
    original.release();
    original.frames(4);
    const snapshot = original.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.actors.acidGlobs).toHaveLength(1);
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
    expect(restored.session.actors.acidGlobs).toEqual(original.session.actors.acidGlobs);
    // The acid-bodied spitter itself comes back whole, not only its glob.
    expect(restored.session.actors.snapshotState()).toEqual(original.session.actors.snapshotState());
    original.land();
    restored.land();
    expect(original.hits).toHaveBeenCalledTimes(1);
    expect(restored.hits.mock.calls).toEqual(original.hits.mock.calls);
    expect(restored.impacts).toEqual(original.impacts);
    expect(restored.session.sim.body.snapshotState()).toEqual(original.session.sim.body.snapshotState());
  });
});

const missedSpit = (woundFixture = false) => {
  const h = runtime(undefined, 71, false, { woundFixture });
  h.release();
  h.sidestep();
  h.land();
  if (h.session.actors.acidPuddles.length !== 1) {
    throw new Error('Fixture missed spit did not create exactly one puddle');
  }
  return h;
};

describe('acid puddle', () => {
  it('wear, wound and severing outcomes depend on simulated exposure rather than frame size', () => {
    const expose = (step: number) => {
      const h = missedSpit(true);
      h.walkTo(h.session.actors.acidPuddles[0]!.pos);
      const trousers = h.session.inventory.create('jeans');
      expect(h.session.inventory.add(trousers, { kind: 'worn' })).toBe(true);
      const before = trousers.condition;
      const actor = h.session.actorStore.get(
        h.session.actors.add(shambler, [h.session.body.pos[0], h.session.body.pos[1], h.session.body.pos[2]]),
      )!;
      const beforeLeg = actor.regions.leftLeg!;
      const duration = spitter.acidSpit!.puddle.lifetimeSimSeconds / 4;
      for (let index = 0; index < Math.round(duration / step); index++) {
        h.session.frame(step);
      }
      const bleeding = ['leftLeg', 'rightLeg'].map(
        (region) => h.session.sim.body.wounds[region as 'leftLeg' | 'rightLeg']?.bleeding,
      );
      expect(trousers.condition).toBeLessThan(before);
      expect(trousers.condition).toBeGreaterThan(0);
      expect(bleeding.every((tier) => tier !== undefined)).toBe(true);
      expect(actor.regions.leftLeg).toBeLessThan(beforeLeg);
      expect(actor.severed).toEqual([]);
      return {
        condition: trousers.condition,
        bleeding,
        regions: actor.regions,
        severed: actor.severed,
        exposures: h.session.sim.exposures.snapshotState().exposures,
      };
    };
    const fine = expose(1 / 60);
    const coarse = expose(1 / 30);
    expect(coarse.condition).toBeCloseTo(fine.condition, 10);
    expect(coarse.bleeding).toEqual(fine.bleeding);
    expect(coarse.severed).toEqual(fine.severed);
    for (const region of Object.keys(fine.regions)) {
      expect(coarse.regions[region]).toBeCloseTo(fine.regions[region]!, 10);
    }
    expect(fine.exposures.length).toBeGreaterThan(0);
    expect(coarse.exposures).toEqual(fine.exposures);
  });

  it('a missed glob creates a puddle that expires after its content lifetime', () => {
    const h = missedSpit();
    const puddle = h.session.actors.acidPuddles[0]!;
    expect(puddle.remainingSimSeconds).toBeGreaterThan(0);
    expect(puddle.remainingSimSeconds).toBeLessThanOrEqual(spitter.acidSpit!.puddle.lifetimeSimSeconds);
    h.frames(Math.ceil((spitter.acidSpit!.puddle.lifetimeSimSeconds + 1) * 60));
    expect(h.session.actors.acidPuddles).toHaveLength(0);
  });

  it('burns both player legs in proportion to exposure time through continuous contacts', () => {
    const h = missedSpit();
    h.walkTo(h.session.actors.acidPuddles[0]!.pos);
    const trousers = h.session.inventory.create('jeans');
    expect(h.session.inventory.add(trousers, { kind: 'worn' })).toBe(true);
    const { condition } = trousers;
    h.burns.mockClear();
    h.frames(6);
    const sum = () => h.burns.mock.calls.reduce((total, [damage]) => total + damage, 0);
    const first = sum();
    expect(first).toBeGreaterThan(0);
    expect(new Set(h.burns.mock.calls.map((call) => call[1]))).toEqual(new Set(['leftLeg', 'rightLeg']));
    expect(h.hits).not.toHaveBeenCalled();
    expect(first).toBeCloseTo((spitter.acidSpit!.puddle.damagePerSimSecond * 6) / 60);
    const left = h.burns.mock.calls
      .filter((call) => call[1] === 'leftLeg')
      .reduce((total, [damage]) => total + damage, 0);
    expect(left).toBeCloseTo(first / 2);
    expect(trousers.condition).toBeLessThan(condition);
    expect(h.session.sim.actions.startWait()).toBeDefined();
    h.frames(6);
    expect(sum()).toBeCloseTo(first * 2);
    expect(h.session.sim.body.pain.felt).toBeGreaterThan(0);
  });

  it('lets a player in acid-impervious boots stand in it unharmed and unrefused', () => {
    const h = missedSpit();
    const worn = ['jeans', 'rubber_boots'].map((type) => {
      const item = h.session.inventory.create(type);
      expect(h.session.inventory.add(item, { kind: 'worn' })).toBe(true);
      return { item, condition: item.condition };
    });
    const { health } = h.session.sim.body;
    const contacts = vi.spyOn(h.session.sim, 'expose');
    h.burns.mockClear();
    h.walkTo(h.session.actors.acidPuddles[0]!.pos);
    h.frames(30);
    expect(h.session.actors.acidPuddles).toHaveLength(1);
    expect(contacts).toHaveBeenCalled();
    expect(h.burns).not.toHaveBeenCalled();
    expect(h.session.sim.body.health).toBeGreaterThanOrEqual(health);
    for (const { item, condition } of worn) {
      expect(item.condition).toBe(condition);
    }
    expect(h.session.sim.actions.startWait()).toBeUndefined();
  });

  it('burns a shambler standing in it but not an acid-immune zombie', () => {
    const h = missedSpit();
    const { pos } = h.session.actors.acidPuddles[0]!;
    const ordinary = h.session.actorStore.get(h.session.actors.add(shambler, [...pos]))!;
    const immune = h.session.actorStore.get(h.session.actors.add(resistant, [...pos]))!;
    const before = { ...ordinary.regions };
    const immuneBefore = { ...immune.regions };
    h.frames(Math.floor(spitter.acidSpit!.puddle.lifetimeSimSeconds * 60));
    expect(ordinary.severed).toEqual([]);
    expect(ordinary.regions.leftLeg).toBeLessThan(before.leftLeg!);
    expect(ordinary.regions.rightLeg).toBeLessThan(before.rightLeg!);
    expect(immune.regions).toEqual(immuneBefore);
  });

  it('restores a mid-puddle disk save with the same subsequent burns and expiry', async () => {
    const original = missedSpit();
    original.walkTo(original.session.actors.acidPuddles[0]!.pos);
    original.frames(4);
    const snapshot = original.session.snapshot({ worldId: 'fixture_world', characterId: 'fixture_character' });
    expect(snapshot.world.actors.acidPuddles).toHaveLength(1);
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
    original.burns.mockClear();
    expect(restored.session.actors.acidPuddles).toEqual(original.session.actors.acidPuddles);
    const frames = Math.ceil((spitter.acidSpit!.puddle.lifetimeSimSeconds + 1) * 60);
    original.frames(frames);
    restored.frames(frames);
    expect(original.burns.mock.calls.length).toBeGreaterThan(0);
    expect(restored.burns.mock.calls).toEqual(original.burns.mock.calls);
    expect(restored.session.sim.body.snapshotState()).toEqual(original.session.sim.body.snapshotState());
    expect(original.session.actors.acidPuddles).toHaveLength(0);
    expect(restored.session.actors.acidPuddles).toHaveLength(0);
    for (const h of [original, restored]) {
      const tails = h.session.sim.exposures.snapshotState().exposures;
      expect(tails.length).toBeGreaterThan(0);
      expect(tails.every((exposure) => exposure.sources.every((source) => source.remaining !== undefined))).toBe(true);
      h.frames(Math.ceil(h.session.sim.body.tuning.linger.acid!.simSeconds * 60));
      expect(h.session.sim.exposures.active).toBe(false);
    }
  });
});
