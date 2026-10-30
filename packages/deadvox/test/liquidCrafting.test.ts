import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import type { RecipeDef } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { type CraftSources, planCraft } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { ItemFactory, restoreItem, sameRecoveryState, snapshotItem, stackRoom } from '../src/core/items.ts';
import { planLiquidDraw } from '../src/core/liquids.ts';
import { bindReach } from '../src/core/reach.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayCommandOwners,
} from '../src/game/replayCommands.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry, fixtureSources } from './economyFixtures.ts';
import {
  BURN_RESULT,
  FULL,
  liquidCraftData,
  OTHER,
  QUALITY,
  RECIPE,
  SOLID_RECIPE,
  STOCK,
  VESSEL,
} from './liquidCraftFixture.ts';
import { Simulation } from './simulationFixture.ts';

const registry = baseRegistryWith(fixtureSources([{ source: 'fixture-liquid-craft', data: liquidCraftData() }]));
const definition = registry.recipes.get(RECIPE)!;
const origin: [number, number, number] = [0, 0, 0];
const staged = (ok: boolean): void => {
  if (!ok) {
    throw new Error('Cannot stage liquid craft fixture');
  }
};
const setup = (
  volumes: number[] = [10, 10],
  recipe: RecipeDef = definition,
  saved?: ReturnType<Inventory['snapshotState']>,
) => {
  const definitions = { ...registry, recipes: new Map(registry.recipes).set(recipe.id, recipe) };
  const character = new Character(definitions);
  character.learnRecipes([recipe.id, SOLID_RECIPE]);
  const inventory = saved
    ? Inventory.restoreState(definitions, saved)
    : new Inventory(definitions, undefined, undefined, character);
  const vessels = saved
    ? []
    : volumes.map((volume) => {
        const vessel = inventory.create(VESSEL);
        staged(inventory.add(vessel, { kind: 'pile', pos: origin }));
        const donor = inventory.create(FULL);
        staged(inventory.add(donor, { kind: 'pile', pos: origin }));
        staged(inventory.transferLiquid(donor.uid, vessel.uid, volume).ok);
        staged(inventory.move(donor, { kind: 'pile', pos: [100, 0, 0] }).ok);
        return vessel;
      });
  if (!saved) {
    staged(inventory.add(inventory.create(STOCK, 4), { kind: 'pile', pos: origin }));
  }
  const reach = bindReach({ inventory, position: origin, blockSize: 0.5, clock: BASE_CLOCK });
  const sim = new Simulation({ seed: 1 });
  sim.actions.craft = craftActionHooks(inventory, character, reach, {
    feet: () => origin,
    calendar: () => sim.calendar,
  });
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  return { inventory, character, vessels, reach, sim, commands, definitions };
};
const counterRecipe: RecipeDef = {
  ...definition,
  components: [
    [{ liquid: STOCK, volumeMicrolitres: 10 }],
    [{ liquid: STOCK, volumeMicrolitres: 10 }],
    [{ item: STOCK, count: 1 }],
  ],
};
const recorded = (r: ReturnType<typeof setup>, sources?: CraftSources) => {
  const result = planCraft(r.definitions.recipes.get(definition.id)!, r.reach(), r.character, { sources });
  if (!('plan' in result)) {
    throw new Error(result.missing.reason);
  }
  return result.plan;
};
const contents = (r: ReturnType<typeof setup>) => r.vessels.map((item) => snapshotItem(item).liquidContents);
const drain = (r: ReturnType<typeof setup>, uid: number) => {
  const receiver = r.inventory.create(VESSEL);
  staged(r.inventory.add(receiver, { kind: 'pile', pos: origin }));
  staged(r.inventory.transferLiquid(uid, receiver.uid).ok);
  return receiver;
};

it('draw admission refuses a different kind and refuses a short source without clamping', () => {
  const r = setup([10]);
  expect(planLiquidDraw(registry, r.vessels[0], OTHER, 1)).toEqual({ ok: false, reason: 'incompatible-liquid' });
  expect(planLiquidDraw(registry, r.vessels[0], STOCK, 11)).toEqual({ ok: false, reason: 'short' });
});
it('the draw mutation owner leaves both vessels unchanged when the second is short', () => {
  const r = setup([10, 5]);
  const before = contents(r);
  expect(
    r.inventory.drawLiquids(r.vessels.map(({ uid }) => ({ uid, liquid: STOCK, volumeMicrolitres: 10 }))),
  ).toMatchObject({ ok: false, reason: 'short' });
  expect(contents(r)).toEqual(before);
});
it('draw admission sums repeated draws against one vessel capacity', () => {
  const r = setup([10]);
  const draw = { uid: r.vessels[0]!.uid, liquid: STOCK, volumeMicrolitres: 6 };
  expect(r.inventory.planLiquidDraws([draw, draw])).toMatchObject({ ok: false, reason: 'short' });
});
it('a reserved vessel-tool can supply the liquid needed alongside solid stock', () => {
  const recipe = {
    ...definition,
    qualities: { [QUALITY]: 1 },
    components: [[{ liquid: STOCK, volumeMicrolitres: 100 }], [{ item: STOCK, count: 1 }]],
  };
  const r = setup([100, 10], recipe);
  const plan = recorded(r);
  expect(plan.tools[0]!.item).toBe(r.vessels[0]);
  expect(plan.liquids.flatMap((draw) => draw.sources).some((source) => source.item === plan.tools[0]!.item)).toBe(true);
});
it('liquid allocation reroutes a default group to preserve a later binding source list', () => {
  const r = setup([10, 10], counterRecipe);
  const plan = recorded(r, { 1: [r.vessels[0]!.uid] });
  expect(plan.liquids.map((draw) => draw.sources.map((source) => source.item.uid))).toEqual([
    [r.vessels[1]!.uid],
    [r.vessels[0]!.uid],
  ]);
});
it('a colliding item id cannot satisfy a preferred liquid alternative', () => {
  const recipe = {
    ...definition,
    components: [
      [
        { item: STOCK, count: 1 },
        { liquid: STOCK, volumeMicrolitres: 10 },
      ],
    ],
  };
  const r = setup([], recipe);
  expect(
    planCraft(recipe, r.reach(), r.character, { prefer: { 0: { kind: 'liquid', liquid: STOCK } } }),
  ).toHaveProperty('missing');
});
it('a short named list never tops up from other default vessels', () => {
  const r = setup([5, 100]);
  expect(planCraft(definition, r.reach(), r.character, { sources: { 0: [r.vessels[0]!.uid] } })).toHaveProperty(
    'missing',
  );
});
it('Continue admits empty recorded vessels but finish stops at full progress retaining escrow and all balances', () => {
  const r = setup();
  expect(r.commands.start(definition.id)).toBeUndefined();
  const work = r.inventory.hands.right!;
  const escrow = work.work!.components.map((item) => item.uid);
  r.sim.actions.stop();
  drain(r, r.vessels[1]!.uid);
  const before = r.inventory.snapshotState().piles;
  expect(r.commands.act(work.uid, 'continue')).toBeUndefined();
  r.sim.scheduler.advance(Math.ceil(work.work!.duration / r.sim.clock.ratio) + 1);
  expect(r.sim.actions.job).toMatchObject({ jobType: 'craft', stopped: true, workUid: work.uid });
  expect(work.work!.elapsed).toBe(work.work!.duration);
  expect(work.work!.components.map((item) => item.uid)).toEqual(escrow);
  expect(r.inventory.snapshotState().piles).toEqual(before);
  expect(r.sim.compression.interruption ?? '').toContain(registry.liquids.get(STOCK)!.name);
  expect(r.sim.compression.interruption ?? '').toContain(registry.items.get(r.vessels[1]!.type)!.name);
});
it('refilling the recorded vessel and continuing finishes on the next tick with the exact recorded debit', () => {
  const r = setup([20, 20]);
  expect(r.commands.start(definition.id, {}, { 0: [r.vessels[0]!.uid] })).toBeUndefined();
  const work = r.inventory.hands.right!;
  r.sim.actions.stop();
  const receiver = drain(r, r.vessels[0]!.uid);
  expect(r.commands.act(work.uid, 'continue')).toBeUndefined();
  r.sim.scheduler.advance(Math.ceil(work.work!.duration / r.sim.clock.ratio) + 1);
  expect(work.work!.elapsed).toBe(work.work!.duration);
  expect(r.inventory.transferLiquid(receiver.uid, r.vessels[0]!.uid).ok).toBe(true);
  const untouched = snapshotItem(r.vessels[1]!).liquidContents;
  expect(r.commands.act(work.uid, 'continue')).toBeUndefined();
  r.sim.scheduler.advance(1);
  expect(work.work).toBeUndefined();
  expect(r.inventory.hands.right!.craftedLiquids).toEqual([{ liquid: STOCK, volumeMicrolitres: 10 }]);
  expect(r.vessels[0]!.liquidContents).toEqual({ kind: 'empty' });
  expect(r.vessels[1]!.liquidContents).toEqual(untouched);
});
it('drop-placement refusal precedes every liquid balance change', () => {
  const r = setup();
  const work = r.inventory.beginWork(recorded(r))!;
  expect(r.inventory.move(work, { kind: 'pile', pos: origin }).ok).toBe(true);
  r.inventory.landing = () => undefined;
  const before = contents(r);
  expect(() => r.inventory.releaseWork(work, true, origin)).toThrow();
  expect(contents(r)).toEqual(before);
  expect(work.work).toBeDefined();
});
it('saved work preserves each group source and rejects a tampered source volume', () => {
  const r = setup([10, 10], counterRecipe);
  const work = r.inventory.beginWork(recorded(r, { 1: [r.vessels[0]!.uid] }))!;
  const saved = r.inventory.snapshotState();
  const restored = Inventory.restoreState(r.definitions, saved);
  expect(restored.itemByUid(work.uid)!.work).toEqual(work.work);
  const tampered = structuredClone(saved);
  const payload = tampered.hands.right!.work!;
  if (payload.kind !== 'craft') {
    throw new Error('Not craft work');
  }
  payload.liquids![0]!.sources[0]!.volumeMicrolitres += 1;
  expect(() => Inventory.restoreState(r.definitions, tampered)).toThrow();
});
it('replayed default selection debits the same uid for tied vessels across a save restore', () => {
  const recipe = { ...definition, components: [[{ liquid: STOCK, volumeMicrolitres: 10 }]] };
  const r = setup([10, 10], recipe);
  const saved = structuredClone(r.inventory.snapshotState());
  // Reversing saved tree order must not change the uid tie-break.
  for (const pile of saved.piles) {
    pile.items.reverse();
  }
  const restored = setup([], recipe, saved);
  const payload = { kind: 'craft.start', recipeId: recipe.id, preference: { 0: { kind: 'liquid', liquid: STOCK } } };
  expect(isReplayActionPayload(payload)).toBe(true);
  if (!isReplayActionPayload(payload)) {
    throw new Error('Invalid replay fixture');
  }
  const run = (runtime: ReturnType<typeof setup>) => {
    const owners = new Proxy(
      { craftStart: (...args: Parameters<ReplayCommandOwners['craftStart']>) => runtime.commands.start(...args) },
      {
        get: (target, key) =>
          key === 'craftStart'
            ? target.craftStart
            : () => {
                throw new Error(`Unexpected owner ${String(key)}`);
              },
      },
    ) as ReplayCommandOwners;
    expect(applyReplayActionPayload(payload, owners)).toBeUndefined();
    const work = runtime.inventory.hands.right!;
    const draws = work.work!.kind === 'craft' ? work.work!.liquids! : [];
    const { uid } = draws[0]!.sources[0]!;
    runtime.sim.scheduler.advance(Math.ceil(work.work!.duration / runtime.sim.clock.ratio) + 1);
    expect(runtime.inventory.itemByUid(uid)!.liquidContents).toEqual({ kind: 'empty' });
    return uid;
  };
  expect(run(restored)).toBe(run(r));
});
it('solid and liquid route results never stack and a split preserves per-unit records through restore', () => {
  const r = setup([40]);
  const liquid = r.inventory.beginWork(recorded(r))!;
  r.inventory.releaseWork(liquid, true, origin);
  const result = r.inventory.hands.right!;
  expect(r.inventory.move(result, { kind: 'pile', pos: origin }).ok).toBe(true);
  const solidRecipe = r.definitions.recipes.get(SOLID_RECIPE)!;
  const solidPlan = planCraft(solidRecipe, r.reach(), r.character);
  if (!('plan' in solidPlan)) {
    throw new Error(solidPlan.missing.reason);
  }
  const solid = r.inventory.beginWork(solidPlan.plan)!;
  r.inventory.releaseWork(solid, true, origin);
  const solidResult = r.inventory.hands.right!;
  expect(stackRoom(r.definitions, solidResult, result)).toBe(0);
  expect(stackRoom(r.definitions, result, solidResult)).toBe(0);
  // Splitting is exercised through the public move owner.
  expect(r.inventory.move(result, { kind: 'hand', side: 'left' }, 1).ok).toBe(true);
  const part = r.inventory.hands.left!;
  expect(part.craftedLiquids).toEqual(result.craftedLiquids);
  expect(part.craftedLiquids).not.toBe(result.craftedLiquids);
  const restored = Inventory.restoreState(r.definitions, r.inventory.snapshotState());
  expect(restored.itemByUid(part.uid)!.craftedLiquids).toEqual(result.craftedLiquids);
  expect(restored.itemByUid(result.uid)!.craftedLiquids).toEqual(result.craftedLiquids);
});
it('equal provenance with unequal burn or an active clock cannot merge through preview or the merge owner', () => {
  const factory = new ItemFactory();
  const initial = factory.create(registry, BURN_RESULT);
  const fresh = restoreItem(registry, {
    ...snapshotItem(initial),
    craftedLiquids: [{ liquid: STOCK, volumeMicrolitres: 100 }],
  });
  const burnt = restoreItem(registry, { ...snapshotItem(fresh), uid: initial.uid + 1, burnRemainingGameSeconds: 1800 });
  expect(stackRoom(registry, fresh, burnt)).toBe(0);
  expect(stackRoom(registry, burnt, fresh)).toBe(0);
  const inventory = new Inventory(registry);
  const owner = inventory as unknown as { mergeStack: (a: typeof fresh, b: typeof fresh) => void };
  expect(() => owner.mergeStack(fresh, burnt)).toThrow();
  const lit = restoreItem(registry, { ...snapshotItem(burnt), on: true, litAtGameTimestamp: 0 });
  const otherLit = restoreItem(registry, { ...snapshotItem(lit), uid: lit.uid + 1 });
  expect(stackRoom(registry, lit, otherLit)).toBe(0);
  expect(() => owner.mergeStack(lit, otherLit)).toThrow();
  expect(sameRecoveryState(fresh, restoreItem(registry, { ...snapshotItem(fresh), uid: 99 }))).toBe(true);
});

describe('liquid recipe content validation', () => {
  it.each(['unregistered', 'unaccepted', 'indivisible'] as const)('reports one issue for %s liquid input', (mode) => {
    const data = liquidCraftData();
    const input = data.recipes[0]!.components[0]![0]!;
    if (!('liquid' in input)) {
      throw new Error('Not a liquid fixture');
    }
    if (mode === 'unregistered') {
      input.liquid = 'fixture_missing';
    }
    if (mode === 'unaccepted') {
      data.items = data.items.filter((item) => !('vessel' in item));
    }
    if (mode === 'indivisible') {
      input.volumeMicrolitres = 21;
    }
    const result = buildFixtureRegistry([{ source: 'fixture-liquid-input', data }]);
    expect(result.issues).toHaveLength(1);
  });
});
