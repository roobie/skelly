import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry, requireDayCycle } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { EventRuleDef } from '../src/core/schema.ts';
import { gameHours } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { ZOMBIE_RATE } from '../src/game/simulationRates.ts';
import { startupContent } from './baseRegistry.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';
import { formatVersion } from './snapshotTestSupport.ts';

const { registry } = startupContent();
const profile = [...registry.scenarios.values()][0]!;
const zombie = [...registry.zombies.values()][0]!;
const worldOptions = { blockSize: 0.5, site: profile.id, storeys: 1, density: null };
const AFTER = gameHours(2);
/** Inside the one loaded chunk, beside the player. */
const NEAR: Vec3 = [4, 1, 4];
/** Far outside every loaded chunk and the active radius. */
const FAR: Vec3 = [320, 1, 320];

const waveRule = (at: Vec3, conditions: EventRuleDef['conditions'] = []): EventRuleDef => ({
  id: 'fixture_wave',
  trigger: { kind: 'elapsed', afterGameHours: AFTER },
  conditions,
  effects: [{ kind: 'releaseHorde', zombie: zombie.id, count: 2, at }],
});

const fixture = (rule: EventRuleDef, restore?: Readonly<SaveSnapshot>) => {
  const world = new World();
  const chunk = new Chunk(0, 0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk.set(x, 0, z, registry.blockIds.get('concrete')!);
    }
  }
  world.addChunk(chunk);
  const entities = new BlockEntities(registry);
  const solid = worldSolid(world, registry, entities);
  const session = createSession({
    registry,
    scenario: { ...profile, eventRules: [rule] },
    world,
    entities,
    scale: makeScale(0.5),
    isSolid: solid,
    isOpaque: solid,
    ready: () => true,
    seed: 13,
    start: 43_200,
    spawn: [8.5, 1, 8.5],
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
  const capture = () => session.snapshot({ worldId: 'fixture-world', characterId: 'fixture-character' });
  /** Debug time travel, then a frame long enough for one zombie tick to see the new calendar. */
  const jump = (calendar: number) => {
    session.sim.setDebugCalendarTime(calendar);
    session.frame(1 / ZOMBIE_RATE);
  };
  const due = session.scenarioRun!.startedAtGameTimestamp + AFTER;
  const fired = () => capture().character.scenarioRun!.eventsFiredAtGameTimestamp[rule.id];
  const released = () => capture().world.zombies.hordes.filter(({ id }) => id.startsWith('event:')).length;
  return { session, capture, jump, due, fired, released };
};

const roundTrip = async (snapshot: Readonly<SaveSnapshot>): Promise<SaveSnapshot> =>
  (
    await decodeSave(await encodeSave(snapshot, { generation: 1, version: formatVersion, worldOptions }), {
      version: formatVersion,
      contentLookup: () => true,
    })
  ).snapshot;

describe('scenario event rules', () => {
  it('fires an elapsed-time rule once, on the first tick at its time', () => {
    const f = fixture(waveRule(NEAR));
    f.jump(f.due - 1);
    expect(f.fired()).toBeUndefined();
    expect(f.released()).toBe(0);
    f.jump(f.due);
    const firedAt = f.fired()!;
    expect(firedAt).toBeGreaterThanOrEqual(f.due);
    expect(firedAt).toBeLessThanOrEqual(f.session.sim.calendar);
    expect(f.released()).toBe(1);
    for (let n = 0; n < 30; n++) {
      f.session.frame(1 / 60);
    }
    f.jump(f.due + AFTER);
    expect(f.fired()).toBe(firedAt);
    expect(f.released()).toBe(1);
  });

  it.each([
    ['before', -1],
    ['after', 0],
  ])('fires exactly once across a save just %s its time', async (_label, offset) => {
    const first = fixture(waveRule(NEAR));
    first.jump(first.due + offset);
    const restored = fixture(waveRule(NEAR), await roundTrip(first.capture()));
    // A loaded game waits paused for the player to resume it.
    restored.session.sim.paused = false;
    restored.jump(restored.due + 60);
    expect(restored.released()).toBe(1);
    expect(Object.keys(restored.capture().character.scenarioRun!.eventsFiredAtGameTimestamp)).toEqual(['fixture_wave']);
    if (offset === 0) {
      expect(restored.fired()).toBe(first.fired());
    }
  });

  it('fires at the same time whether its horde arrives in a loaded column near the player or far outside', () => {
    const firing = [NEAR, FAR].map((at) => {
      const f = fixture(waveRule(at));
      f.jump(f.due);
      expect(f.released()).toBe(1);
      return f.fired();
    });
    expect(firing[0]).toBeDefined();
    expect(firing[1]).toBe(firing[0]);
  });

  it('waits after its trigger until its day-phase condition holds', () => {
    const cycle = requireDayCycle(registry);
    const probe = fixture(waveRule(NEAR));
    const duePhase = dayPhaseAt(cycle, probe.due).phase;
    const other = (['night', 'day'] as const).find((phase) => phase !== duePhase)!;
    const f = fixture(waveRule(NEAR, [{ kind: 'dayPhase', phases: [other] }]));
    f.jump(f.due);
    expect(f.fired()).toBeUndefined();
    let calendar = f.due;
    while (dayPhaseAt(cycle, calendar).phase !== other) {
      calendar += 600;
    }
    f.jump(calendar);
    expect(f.fired()).toBeGreaterThanOrEqual(calendar);
    expect(f.released()).toBe(1);
  });

  it.each([
    ['an unadmitted trigger kind', { trigger: { kind: 'area' } }, '.trigger.kind', 'elapsed'],
    ['a missing zombie type', {}, '.zombie', 'no zombie type'],
    ['a duplicate id', 'duplicate', '.id', 'duplicate event rule'],
  ] as const)('rejects a scenario whose rule has %s', (_label, change, pathEnd, message) => {
    const scenario = fixtureScenario();
    const rule = {
      id: 'fixture_rule',
      trigger: { kind: 'elapsed', afterGameHours: 1 },
      effects: [{ kind: 'releaseHorde', zombie: 'missing_fixture_zombie', count: 1, at: [0, 1, 0] }],
    };
    const rules = change === 'duplicate' ? [rule, rule] : [{ ...rule, ...change }];
    const sources = fixtureScenarioSources(scenario);
    const data = sources[0]!.data as { scenarios: unknown[] };
    data.scenarios = [{ ...scenario, outbreakAgeGameHours: 24, eventRules: rules }];
    const rejected = buildRegistry(sources);
    expect(
      rejected.issues.some(
        (issue) =>
          issue.path.includes('.eventRules') &&
          issue.path.endsWith(pathEnd) &&
          `${issue.path} ${issue.message}`.includes(message),
      ),
    ).toBe(true);
    expect(rejected.registry.scenarios.has(scenario.id)).toBe(false);
  });
});
