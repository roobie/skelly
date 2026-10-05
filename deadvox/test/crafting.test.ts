import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel } from '../src/core/character.ts';
import { buildRegistry, type RecipeDef } from '../src/core/content.ts';
import { admissionRefusal, indexCraftReach, planCraft, requirementStatus } from '../src/core/crafting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach, type ReachSnapshot } from '../src/core/reach.ts';

const inputs = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const { registry } = buildRegistry(inputs);
const recipe = (components: RecipeDef['components'], qualities: RecipeDef['qualities'] = {}): RecipeDef => ({
  id: 'fixture',
  result: { item: 'torch', count: 1 },
  time: 20,
  skills: {},
  qualities,
  components,
});
const character = { skills: {}, knownRecipes: new Set(['fixture']) };
const stock = (
  specs: { type: string; count?: number; condition?: number; time?: number }[],
  definitions = registry,
) => {
  const inventory = new Inventory(definitions);
  const items = specs.map((spec, index) => {
    const item = inventory.create(spec.type, spec.count ?? 1);
    item.condition = spec.condition ?? 1;
    if (!inventory.add(item, { kind: 'pile', pos: [(index % 3) - 1, 0, Math.floor(index / 3) - 1] })) {
      throw new Error(`Cannot stage planner fixture item ${spec.type}`);
    }
    return item;
  });
  const live = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
  const snapshot: ReachSnapshot = {
    ...live,
    entries: live.entries.map((entry) => ({
      ...entry,
      handlingTime: specs[items.indexOf(entry.item)]!.time ?? entry.handlingTime,
    })),
  };
  return { inventory, items, snapshot };
};

describe('pure craft planner', () => {
  it('names the first understocked component group instead of reporting allocation competition', () => {
    const { snapshot } = stock([{ type: 'rag' }, { type: 'wax' }]);
    const definition = recipe([
      [{ item: 'rag', count: 1 }],
      [
        { item: 'wax', count: 2 },
        { item: 'stick', count: 2 },
      ],
    ]);
    const result = planCraft(definition, snapshot, character);
    expect('missing' in result).toBe(true);
    if (!('missing' in result)) {
      throw new Error('understocked component group unexpectedly planned');
    }
    expect(result.missing.components).toEqual(requirementStatus(definition, snapshot, character).components);
  });
  it('bounds overlapping multi-quality provider work while retaining the cheapest disjoint components', () => {
    const definition = {
      ...recipe(['crowbar', 'kitchen_knife', 'can_opener'].map((item) => [{ item, count: 1 }])),
      qualities: { hammering: 1, prying: 1, cutting: 1, opening: 1 },
    };
    const built = buildRegistry([
      ...inputs,
      {
        source: 'multi-quality.json',
        data: {
          recipes: [definition],
          items: [
            { ...registry.items.get('crowbar')!, stack: 4 },
            {
              ...registry.items.get('school_backpack')!,
              container: { pockets: [{ name: 'Fixture', grid: [600, 8], handling: 0.5 }] },
            },
          ],
        },
      },
    ]);
    expect(built.issues).toEqual([]);
    const inventory = new Inventory(built.registry);
    const bag = inventory.create('school_backpack');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    const types = ['crowbar', 'kitchen_knife', 'can_opener'];
    for (let i = 0; i < 199; i += 1) {
      const item = inventory.create(types[i % 3]!);
      item.condition = (i + 1) / 200;
      expect(
        inventory.add(item, {
          kind: 'pocket',
          owner: bag,
          pocket: 0,
          at: { x: i * 3, y: 0, rotated: false },
        }),
      ).toBe(true);
    }
    const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
    const before = inventory.snapshotState();
    const counted = (qualities: RecipeDef['qualities'], classes = 1) => {
      let reads = 0;
      const countedReach = {
        ...snapshot,
        entries: snapshot.entries.map((entry) => {
          const seconds = entry.handlingTime + (Math.floor(Math.max(0, entry.item.uid - 2) / 3) % classes) * 0.1;
          return {
            ...entry,
            get handlingTime() {
              reads += 1;
              if (reads > 100_000) {
                throw new Error('Tool provider operation budget exceeded');
              }
              return seconds;
            },
          };
        }),
      };
      const result = planCraft({ ...definition, qualities }, countedReach, character);
      expect('plan' in result).toBe(true);
      if (!('plan' in result)) {
        throw new Error(result.missing.reason);
      }
      expect(result.plan.components.map(({ item }) => item.uid).sort((a, b) => a - b)).toEqual([2, 3, 4]);
      expect(
        result.plan.tools.every(({ item }) =>
          result.plan.components.every((component) => component.item.uid !== item.uid),
        ),
      ).toBe(true);
      return { ...result, reads };
    };
    // Independent control: even the old search completes this exact stock with one quality.
    const control = counted({ hammering: 1 });
    const full = counted(definition.qualities);
    process.stdout.write(`craft-tool-provider reads: one=${control.reads} four=${full.reads}\n`);
    expect(full.plan.tools.map(({ quality }) => quality)).toEqual(['cutting', 'hammering', 'opening', 'prying']);
    expect(full.plan.tools.find(({ quality }) => quality === 'hammering')!.item.uid).toBe(
      full.plan.tools.find(({ quality }) => quality === 'prying')!.item.uid,
    );
    const fourClasses = counted(definition.qualities, 4);
    process.stdout.write(`craft-tool-provider four-class reads: ${fourClasses.reads}\n`);
    expect(inventory.snapshotState()).toEqual(before);
    // Keeping only one representative per class would lose this feasible cheapest
    // allocation: reserving both cheap singleton tools avoids two retrievals.
    const varied = stock(
      [
        { type: 'crowbar', time: 0.9 },
        { type: 'crowbar', time: 0.9 },
        { type: 'crowbar', count: 4, time: 1 },
      ],
      built.registry,
    );
    const cheapest = planCraft(
      recipe([[{ item: 'crowbar', count: 2 }]], { hammering: 1, prying: 1 }),
      varied.snapshot,
      character,
    );
    expect(cheapest).toMatchObject({ plan: { components: [{ item: varied.items[2], count: 2 }] } });
  });

  it('finds the cheapest feasible alternative when two groups compete for the same rags', () => {
    const { inventory, snapshot, items } = stock([
      { type: 'rag', count: 2 },
      { type: 'wax', time: 0.1 },
      { type: 'stick', time: 2 },
    ]);
    const before = inventory.snapshotState();
    const definition = recipe([
      [
        { item: 'rag', count: 2 },
        { item: 'stick', count: 1 },
        { item: 'wax', count: 1 },
      ],
      [{ item: 'rag', count: 2 }],
    ]);
    const result = planCraft(definition, snapshot, character);
    expect('plan' in result && result.plan.components.map((component) => component.item)).toEqual([items[0], items[1]]);
    expect('plan' in result && result.plan.work).toBe(definition.time * 60);
    expect(inventory.snapshotState()).toEqual(before);
    // Editing returned plan records must not poison the derived per-reach result cache.
    if ('plan' in result) {
      result.plan.components[0]!.count = 99;
    }
    expect(planCraft(definition, snapshot, character)).toMatchObject({
      plan: { components: [{ count: 2 }, { count: 1 }] },
    });
  });

  it('honors a preferred alternative and refuses an impossible preference instead of falling back', () => {
    const { snapshot, items } = stock([{ type: 'rag', count: 2 }, { type: 'wax' }, { type: 'stick', time: 2 }]);
    const definition = recipe([
      [
        { item: 'rag', count: 2 },
        { item: 'wax', count: 1 },
        { item: 'stick', count: 1 },
      ],
      [{ item: 'rag', count: 2 }],
    ]);
    const preferred = planCraft(definition, snapshot, character, { 0: 'stick' });
    expect('plan' in preferred && preferred.plan.components.map((component) => component.item)).toEqual([
      items[0],
      items[2],
    ]);
    const refused = planCraft(definition, snapshot, character, { 0: 'rag' });
    expect('missing' in refused).toBe(true);
    if (!('missing' in refused)) {
      throw new Error('impossible preference unexpectedly fell back to another plan');
    }
    expect(refused.missing.components).toEqual(requirementStatus(definition, snapshot, character).components);
  });

  it('reserves a separate tool UID even when its type is also a component', () => {
    const definition = recipe([[{ item: 'hammer', count: 1 }]], { hammering: 1 });
    const single = stock([{ type: 'hammer' }]);
    expect('missing' in planCraft(definition, single.snapshot, character)).toBe(true);
    const spare = stock([
      { type: 'hammer', time: 0.1 },
      { type: 'hammer', time: 2 },
    ]);
    const result = planCraft(definition, spare.snapshot, character);
    expect(result).toMatchObject({
      plan: { components: [{ item: spare.items[0] }], tools: [{ item: spare.items[1], quality: 'hammering' }] },
    });
  });

  it('orders stacks by retrieval seconds, then size, condition, and UID', () => {
    const { snapshot, items } = stock([
      { type: 'rag', count: 3, condition: 0.1, time: 0.4 },
      { type: 'rag', count: 1, condition: 0.9, time: 0.5 },
      { type: 'rag', count: 2, condition: 0.1, time: 0.5 },
      { type: 'rag', count: 1, condition: 0.2, time: 0.5 },
      { type: 'rag', count: 1, condition: 0.2, time: 0.5 },
    ]);
    const result = planCraft(recipe([[{ item: 'rag', count: 6 }]]), snapshot, character);
    expect(
      'plan' in result && result.plan.components.map((component) => [component.item.uid, component.count]),
    ).toEqual([
      [items[0]!.uid, 3],
      [items[3]!.uid, 1],
      [items[4]!.uid, 1],
      [items[1]!.uid, 1],
    ]);
  });

  it('excludes a filled container from component stock', () => {
    const inventory = new Inventory(registry);
    const bag = inventory.create('school_backpack');
    expect(inventory.add(bag, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.add(inventory.create('rag'), { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
    expect(planCraft(recipe([[{ item: 'school_backpack', count: 1 }]]), snapshot, character)).toMatchObject({
      missing: { components: [{ alternatives: [{ item: 'school_backpack', needed: 1, available: 0 }] }] },
    });
  });

  it('reports knowledge, skill gaps and the best usable quality level', () => {
    const { snapshot } = stock([{ type: 'hammer', condition: 0 }]);
    const definition = { ...recipe([[{ item: 'rag', count: 1 }]], { hammering: 1 }), skills: { mechanics: 2 } };
    expect(planCraft(definition, snapshot, { skills: { mechanics: 1 }, knownRecipes: new Set() })).toMatchObject({
      missing: {
        knowledge: true,
        skills: [{ skill: 'mechanics', required: 2, available: 1 }],
        qualities: [{ quality: 'hammering', required: 1, available: 0 }],
      },
    });
    const actor = { skills: { mechanics: 1 }, knownRecipes: new Set(['fixture']) };
    const result = planCraft(definition, snapshot, actor);
    expect('missing' in result).toBe(true);
    if ('missing' in result) {
      expect(result.missing.reason).toBe(admissionRefusal(definition, snapshot, actor));
    }
  });

  it('shortens recipe work when a required skill level rises', () => {
    const { snapshot } = stock([{ type: 'rag' }]);
    const definition = { ...recipe([[{ item: 'rag', count: 1 }]]), skills: { crafting: 0 } };
    const novice = planCraft(definition, snapshot, { skills: { crafting: 0 }, knownRecipes: new Set(['fixture']) });
    const trained = planCraft(definition, snapshot, { skills: { crafting: 1 }, knownRecipes: new Set(['fixture']) });
    expect('plan' in novice && 'plan' in trained).toBe(true);
    if (!('plan' in novice && 'plan' in trained)) {
      throw new Error('Fixture craft was not plannable');
    }
    expect(trained.plan.work).toBeLessThan(novice.plan.work);
  });

  it('records planning every base recipe against one indexed 200-item reach snapshot', () => {
    const benchmarkRegistry = { ...registry, items: new Map(registry.items) };
    const baseBag = registry.items.get('school_backpack')!;
    benchmarkRegistry.items.set(baseBag.id, {
      ...baseBag,
      container: { pockets: [{ name: 'Benchmark', grid: [600, 8], handling: 0.5 }] },
    });
    const inventory = new Inventory(benchmarkRegistry);
    const bag = inventory.create('school_backpack');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    const types = [
      'stick',
      'rag',
      'wax',
      'repair_kit',
      'kitchen_knife',
      'hammer',
      'scrap_metal',
      'duct_tape',
      'copper_wire',
      'field_patch',
    ];
    for (let i = 0; i < 199; i += 1) {
      const type = types[i % types.length]!;
      const item = inventory.create(type, ['stick', 'rag', 'wax', 'scrap_metal', 'duct_tape'].includes(type) ? 3 : 1);
      expect(
        inventory.add(item, { kind: 'pocket', owner: bag, pocket: 0, at: { x: i * 3, y: 0, rotated: false } }),
      ).toBe(true);
    }
    const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 })();
    expect(snapshot.entries).toHaveLength(200);
    const actor = new Character(benchmarkRegistry);
    actor.learnRecipes([...benchmarkRegistry.recipes.keys()]); // Isolate planning cost from reachable knowledge admission.
    actor.awardPractice('crafting', practiceForNextLevel(actor.skills.crafting!));
    actor.awardPractice(
      'mechanics',
      practiceForNextLevel(actor.skills.mechanics!) + practiceForNextLevel(actor.skills.mechanics! + 1),
    ); // Timings exercise successful plans, including skill-gated recipes.
    const started = performance.now();
    const index = indexCraftReach(snapshot);
    const indexMs = performance.now() - started;
    expect(indexCraftReach(snapshot)).toBe(index);
    const timings = [...registry.recipes.values()].map((definition) => {
      const began = performance.now();
      const result = planCraft(definition, snapshot, actor);
      const elapsedMs = performance.now() - began;
      expect('plan' in result).toBe(true);
      return { recipe: definition.id, elapsedMs };
    });
    process.stdout.write(`CRAFT_PLANNER_200 ${JSON.stringify({ items: snapshot.entries.length, indexMs, timings })}\n`);
  });
});
