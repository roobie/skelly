import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShaderLib, type Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { controlIssues } from '../src/cli/controlIssues.ts';
import rawBaseDayCycle from '../src/content/base/dayCycle.json' with { type: 'json' };
import { isBodyDoor } from '../src/core/blockEntities.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { parseTimeOfDay, resolveSpawnTime } from '../src/core/clock.ts';
import { blockColors, requiredContentIssues, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { Inventory } from '../src/core/inventory.ts';
import { corpseLootPoint, lootTypeIssue } from '../src/core/loot.ts';
import { militaryLootItems } from '../src/core/magazine.ts';
import { blockPatterns, blockWeatherability } from '../src/core/meshInput.ts';
import { opticViewSettings } from '../src/core/opticView.ts';
import { checkReachability } from '../src/core/reachability.ts';
import {
  BLOCK_PATTERNS,
  CONTENT_SECTION_KEYS,
  type ContentFile,
  ContentFileSchema,
  DayCycleSchema,
  type TemplateDef,
} from '../src/core/schema.ts';
import { ordinarySpawnWeights } from '../src/core/settlementSpawns.ts';
import { furnitureOf, lootPointsOf } from '../src/core/site.ts';
import { sitePalette } from '../src/core/sitePalette.ts';
import { SOUND_EVENT_IDS } from '../src/core/soundEvents.ts';
import { templateSpawnClearanceIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate, type Placement } from '../src/core/templates.ts';
import { gameMinutes, simSeconds } from '../src/core/time.ts';
import { DEFAULT_WEATHERING_PROFILE_ID, WEATHERING_RANGES } from '../src/core/weather.ts';
import { INPUT_BINDINGS, inputBindings } from '../src/game/inputBindings.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { camoShaderConfig } from '../src/render/surfacePatterns.ts';
import { buildFixtureRegistry as buildRegistry, FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

const BASE = 'src/content/base';
const CONTEXTUAL_KEY_LABEL = /^(?:[A-Za-z]+|[0-9]|[^\p{L}\p{N}\s]+)$/u;
const INPUT_GESTURE =
  /\b(?:hold|press|tap|click|double[ -]press|wield|activate|throw|scroll|wheel|drag|rotate|snap|spawn)\b/i;
const LMB_ALIAS = /\bLMB\b/i;
const RMB_ALIAS = /\bRMB\b/i;
const NO_FIRING_HOLD_KIND = /neither a grip part nor a stock part/;
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown }));
const baseBuild = buildRegistry(base);
const baseRegistry = baseBuild.registry;

describe('content-owned item and world policies', () => {
  it('requires explicit item policies, region drops and world liveness', () => {
    const item = structuredClone([...baseRegistry.items.values()][0]!) as Record<string, unknown>;
    expect(safeParse(ContentFileSchema, { items: [item] }).success).toBe(true);
    for (const field of ['workInProgress', 'notLoot']) {
      const missing = { ...item };
      delete missing[field];
      expect(safeParse(ContentFileSchema, { items: [missing] }).success).toBe(false);
    }
    const zombie = { ...[...baseRegistry.zombies.values()][0]! } as Record<string, unknown>;
    expect(safeParse(ContentFileSchema, { zombies: [zombie] }).success).toBe(true);
    zombie.severedItems = undefined;
    expect(safeParse(ContentFileSchema, { zombies: [zombie] }).success).toBe(false);
    const world = { ...[...baseRegistry.siteGeneration.values()][0]! } as Record<string, unknown>;
    expect(safeParse(ContentFileSchema, { siteGeneration: [world] }).success).toBe(true);
    world.activeZombieRadiusMetres = undefined;
    expect(safeParse(ContentFileSchema, { siteGeneration: [world] }).success).toBe(false);
  });

  it('validates severed-item references and complete region policy', () => {
    const zombie = { ...structuredClone(baseRegistry.zombies.get('shambler')!), loot: undefined };
    zombie.severedItems = Object.fromEntries(Object.keys(zombie.regions).map((key) => [key, null]));
    const region = Object.keys(zombie.regions)[0]!;
    const support = {
      source: 'support.json',
      data: {
        sounds: [...new Set(Object.values(zombie.sounds))].map((id) => baseRegistry.sounds.get(id)!),
        items: [
          {
            id: 'fixture_blade',
            workInProgress: false,
            notLoot: false,
            economy: { usage: [], tiers: [] },
            name: 'Blade',
            category: 'tool',
            weight: 1,
            size: [1, 1],
            tool: { qualities: { [zombie.downed!.dismember.quality]: 1 } },
          },
        ],
      },
    };
    zombie.severedItems[region] = 'fixture_missing_part';
    const brokenReference = buildRegistry([support, { source: 'parts.json', data: { zombies: [zombie] } }]);
    expect(brokenReference.issues).toContainEqual({
      source: 'parts.json',
      path: `zombies[0].severedItems.${region}`,
      message: 'no item "fixture_missing_part"',
    });
    delete zombie.severedItems[region];
    const missingRegion = buildRegistry([support, { source: 'parts.json', data: { zombies: [zombie] } }]);
    expect(missingRegion.issues).toContainEqual({
      source: 'parts.json',
      path: 'zombies[0].severedItems',
      message: 'severed item keys must match region keys',
    });
  });

  it('requires exactly one runtime escrow definition without selecting its id', () => {
    const items = new Map([...baseRegistry.items].map(([id, item]) => [id, { ...item, workInProgress: false }]));
    const fixture = { ...items.values().next().value!, id: 'fixture_escrow', workInProgress: true };
    const issues = () => requiredContentIssues({ ...baseRegistry, items }).filter((issue) => issue.path === 'items');
    expect(issues()).not.toEqual([]);
    items.set(fixture.id, fixture);
    expect(issues()).toEqual([]);
    items.set('fixture_second_escrow', { ...fixture, id: 'fixture_second_escrow' });
    expect(issues()).not.toEqual([]);
  });
});
const baseSounds = {
  source: 'sounds.json',
  data: {
    sounds: base
      .filter(({ source }) => source.startsWith('sounds'))
      .flatMap(({ data }) => (data as { sounds: unknown[] }).sounds),
  },
};
const reachableLootItems = (root: string | undefined): { table: string; item: string }[] => {
  const found: { table: string; item: string }[] = [];
  const seen = new Set<string>();
  const pending = root === undefined ? [] : [root];
  while (pending.length > 0) {
    const table = baseRegistry.loot.get(pending.pop()!)!;
    if (!seen.has(table.id)) {
      seen.add(table.id);
      for (const { item, table: nested } of table.entries) {
        if (nested !== undefined) {
          pending.push(nested);
        } else if (item !== undefined) {
          found.push({ table: table.id, item });
        }
      }
    }
  }
  return found;
};
const invalidZombieRegionIssues = (zombieId: string, regionId: string, change: 'remove' | 'add') => {
  const zombieFile = base.find((file) => file.source === 'zombies.json')!;
  const data = structuredClone(zombieFile.data) as {
    zombies: { id: string; regions: Record<string, number> }[];
  };
  const { regions } = data.zombies.find(({ id }) => id === zombieId)!;
  if (change === 'remove') {
    delete regions[regionId];
  } else {
    regions[regionId] = 1;
  }
  return validateContent({ source: zombieFile.source, data });
};

it('rejects inventory names that collide within a category and footprint', () => {
  const item = (id: string, name: string) => ({ id, name, category: 'medical', weight: 1, size: [1, 1] });
  const sharedPrefix = 'Shared inventory name '.repeat(8);
  const collision = buildRegistry([
    {
      source: 'inventory-name-fixture.json',
      data: {
        items: [
          item('fixture_collision_a', `${sharedPrefix}alpha`),
          item('fixture_collision_b', `${sharedPrefix}beta`),
        ],
      },
    },
  ]).issues.filter((issue) => issue.message.includes('visible grid name'));
  const distinct = buildRegistry([
    {
      source: 'inventory-name-fixture.json',
      data: {
        items: [
          item('fixture_distinct_a', `Alpha ${sharedPrefix}`),
          item('fixture_distinct_b', `Beta ${sharedPrefix}`),
        ],
      },
    },
  ]).issues.filter((issue) => issue.message.includes('visible grid name'));

  expect(collision).toHaveLength(1);
  expect(collision[0]?.path).toContain('.name');
  expect(distinct).toHaveLength(0);
});

it('validates weathering profile bounds without pinning authored tuning', () => {
  const profile = baseRegistry.weathering.get(DEFAULT_WEATHERING_PROFILE_ID)!;
  const validate = (candidate: typeof profile) =>
    validateContent({ source: 'weathering.json', data: { weathering: [candidate] } });
  expect(validate(profile)).toEqual([]);
  expect(validate({ ...profile, weatheringBlend: 1 })).not.toEqual([]);
  for (const [field, range] of Object.entries(WEATHERING_RANGES)) {
    expect(validate({ ...profile, [field]: range.min } as typeof profile)).toEqual([]);
    expect(validate({ ...profile, [field]: range.max } as typeof profile)).toEqual([]);
    expect(validate({ ...profile, [field]: range.min - 1 } as typeof profile)).not.toEqual([]);
    expect(validate({ ...profile, [field]: range.max + 1 } as typeof profile)).not.toEqual([]);
  }
  expect(validate({ ...profile, tintColor: 'blue' })).not.toEqual([]);
});

it('weathering applies to authored construction, not terrain or vegetation', () => {
  const vegetation = base.find(({ source }) => source === 'vegetation.json')!.data as ContentFile;
  const vegetationIds = (vegetation.blocks ?? []).map(({ id }) => baseRegistry.blockIds.get(id)!);
  const terrainIds = Object.values(sitePalette(baseRegistry).terrain);
  const naturalIds = [...vegetationIds, ...terrainIds];
  const naturalIdSet = new Set(naturalIds);
  const builtIds = baseRegistry.blocks.map((_, id) => id).filter((id) => id !== 0 && !naturalIdSet.has(id));
  const weatherability = blockWeatherability(baseRegistry);

  expect(naturalIds.length).toBeGreaterThan(0);
  expect(naturalIds.every((id) => weatherability[id] === 0)).toBe(true);
  expect(builtIds.length).toBeGreaterThan(0);
  expect(builtIds.some((id) => weatherability[id] === 1)).toBe(true);
});

it('rejects a layout that names an unknown weathering profile', () => {
  const file = base.find(({ data: candidateData }) => 'layouts' in (candidateData as Record<string, unknown>))!;
  const layoutData = structuredClone(file.data) as { layouts: { weatheringProfile?: string }[] };
  layoutData.layouts[0]!.weatheringProfile = 'not_a_weathering_profile';
  const weatheringFile = base.find(({ source }) => source === 'weathering.json')!;
  const result = buildRegistry([weatheringFile, { source: file.source, data: layoutData }]);
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining('.weatheringProfile') })]),
  );
});

interface WindowFrameRun {
  y: number;
  z: number;
  start: number;
  end: number;
}

const frameRunsInRow = (row: string, frame: string): { start: number; end: number }[] => {
  const runs: { start: number; end: number }[] = [];
  let start: number | undefined;
  for (const [x, cell] of Array.from(row).entries()) {
    if (cell === frame) {
      if (start === undefined) {
        start = x;
      }
    } else if (start !== undefined) {
      runs.push({ start, end: x });
      start = undefined;
    }
  }
  if (start !== undefined) {
    runs.push({ start, end: row.length });
  }
  return runs;
};

const windowFrameRuns = (definition: TemplateDef, frame: string): WindowFrameRun[] =>
  definition.layers.flatMap((layer, y) =>
    layer.flatMap((row, z) => frameRunsInRow(row, frame).map(({ start, end }) => ({ y, z, start, end }))),
  );

const firearmFixture = (skillZeroHandling: unknown) => ({
  id: 'fixture_skill_zero_gun',
  name: 'Fixture gun',
  category: 'weapon',
  weight: 1,
  size: [1, 1],
  firearm: { recoilKickRadians: 0.01, dispersionRadians: 0, shotSound: 'gunshot', handling: {}, skillZeroHandling },
});

const runHasAirOpening = (definition: TemplateDef, run: WindowFrameRun, air: string): boolean => {
  for (const adjacentY of [run.y - 1, run.y + 1]) {
    const row = definition.layers[adjacentY]?.[run.z];
    if (row?.slice(run.start, run.end).includes(air)) {
      return true;
    }
  }
  return false;
};

describe('content', () => {
  it('reports shapeless-door clearance issues during registry validation', () => {
    const { issues } = buildRegistry([
      {
        source: 'door-clearance-fixture.json',
        data: {
          blocks: [{ id: 'planks', name: 'Planks', color: '#ffffff', solid: true }],
          furniture: [
            {
              id: 'wood_door',
              name: 'Wood door',
              size: [2, 4, 1],
              color: '#7a5534',
              door: {
                methods: {},
                handlingSimSeconds: 0.5,
              },
            },
          ],
          templates: [
            {
              id: 'door_clearance_fixture',
              size: [6, 5, 4],
              palette: { '.': 'air', '#': 'planks', D: { furniture: 'wood_door', facing: 'n' } },
              layers: [
                ['######', '######', '######', '######'],
                ['......', '..DD..', '..##..', '......'],
                ['......', '..DD..', '..##..', '......'],
                ['......', '..DD..', '..##..', '......'],
                ['......', '..DD..', '..##..', '......'],
              ],
            },
          ],
        },
      },
    ]);

    expect(issues).toContainEqual(
      expect.objectContaining({ source: 'door-clearance-fixture.json', path: 'templates[0].pieces[0]' }),
    );
  });

  it('rejects a template marker whose zombie envelope intersects a solid', () => {
    const fixture: TemplateDef = {
      id: 'spawn_clearance_fixture',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      size: [4, 4, 4],
      palette: { '.': 'air', '#': 'planks', z: { spawn: 'amalgam' } },
      layers: [
        ['####', '####', '####', '####'],
        ['....', '#.z.', '....', '....'],
        ['....', '....', '....', '....'],
        ['....', '....', '....', '....'],
      ],
    };
    const compiled = compileTemplate(baseRegistry, fixture);
    const smallZombieTemplate = compileTemplate(baseRegistry, {
      ...fixture,
      palette: { ...fixture.palette, z: { spawn: 'shambler' } },
    });

    expect(templateSpawnClearanceIssues(baseRegistry, smallZombieTemplate)).toEqual([]);
    expect(templateSpawnClearanceIssues(baseRegistry, compiled).map(([path]) => path)).toEqual(['.spawns[0]']);
  });

  it('keeps soldier spawns within camp authoring and preserves the shambler design', () => {
    const soldier = baseRegistry.zombies.get('military_shambler')!;
    const templateSpawns = [...baseRegistry.templates.values()].flatMap((template) =>
      compileTemplate(baseRegistry, template)
        .spawns.filter(({ zombie }) => zombie === soldier.id)
        .map(() => template.id),
    );
    const layoutSpawns = [...baseRegistry.layouts.values()].flatMap((layout) =>
      layout.shamblers.some(({ type }) => type === soldier.id) ? [layout] : [],
    );
    const soldierSite = (id: string) => id.startsWith('camp_') || id.startsWith('crisis_hq');
    expect(templateSpawns.some((id) => id.startsWith('camp_'))).toBe(true);
    expect(templateSpawns.some((id) => id.startsWith('crisis_hq'))).toBe(true);
    expect(templateSpawns.every(soldierSite)).toBe(true);
    expect(layoutSpawns.length).toBeGreaterThan(0);
    expect(layoutSpawns.every((layout) => layout.buildings.some(({ template }) => template.startsWith('camp_')))).toBe(
      true,
    );

    const shambler = baseRegistry.zombies.get('shambler')!;
    const sharedShamblerData = Object.fromEntries(
      Object.entries(shambler).filter(([key]) => !['id', 'name', 'loot'].includes(key)),
    );
    expect(soldier).toMatchObject({ ...sharedShamblerData, authoredOnly: true });
    expect(soldier.loot).not.toBe(shambler.loot);
  });

  it('excludes authored-only kinds from ordinary settlement spawn weights', () => {
    const soldier = baseRegistry.zombies.get('military_shambler')!;
    expect(ordinarySpawnWeights(baseRegistry).has(soldier.id)).toBe(false);
  });

  it('gives every zombie kind only kit items its corpse can drop', () => {
    const dead = [...baseRegistry.zombies.values()].flatMap((kind) => {
      const { context } = corpseLootPoint(kind.loot ?? '', 0, [0, 0, 0]);
      return reachableLootItems(kind.loot)
        .filter(({ item }) => lootTypeIssue(baseRegistry, item, context) !== undefined)
        .map(({ table, item }) => `${kind.id} → ${table} → ${item}`);
    });
    expect(dead).toEqual([]);
  });

  it('resolves spawn names against the day cycle of the last file that defines one', () => {
    const authored = rawBaseDayCycle.dayCycle;
    const modNoon = authored.noonGameTimeOfDay === '13:30' ? '14:30' : '13:30';
    const { registry } = buildRegistry([
      { source: 'base/dayCycle.json', data: { dayCycle: authored } },
      { source: 'mod/dayCycle.json', data: { dayCycle: { ...authored, noonGameTimeOfDay: modNoon } } },
    ]);
    expect(resolveSpawnTime(registry.dayCycle!, 'noon')).toBe(parseTimeOfDay(modNoon));
  });

  it('rejects sky keys that are out of cycle order or share an instant, naming the field', () => {
    const { keys } = rawBaseDayCycle.dayCycle;
    const swapped = [keys[0]!, keys[2]!, keys[1]!, ...keys.slice(3)];
    // The night's end and the dawn's start are one instant, which the blend cannot tell apart.
    const sharedInstant = keys.map((key, index) => (index === 3 ? { ...key, at: 1 } : key));
    // The last key at the dusk's end is the first key's instant a cycle later (nightfall).
    const wrapped = [...keys, { phase: 'dusk' as const, at: 1, look: 'day' as const }];
    const issuesFor = (candidate: typeof keys): string[] =>
      safeParse(DayCycleSchema, { ...rawBaseDayCycle.dayCycle, keys: candidate }).issues?.map((i) => i.message) ?? [];
    expect(issuesFor(swapped)).toContainEqual(expect.stringContaining('keys[2].at'));
    expect(issuesFor(sharedInstant)).toContainEqual(expect.stringContaining('keys[4].at'));
    expect(issuesFor(wrapped)).toContainEqual(expect.stringContaining(`keys[${keys.length}].at`));
  });

  it('keeps input instructions out of item descriptions', () => {
    const bindingLabels = [
      ...INPUT_BINDINGS.flatMap((binding) =>
        binding.defaults.map((_, index) => inputBindings.alternativeLabel(binding.id, index).split(' + ').at(-1)!),
      ),
      ...Object.values(baseRegistry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.pointerButtonLabels),
    ];
    const controlPatterns = [...new Set(bindingLabels)].map((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');
      if (CONTEXTUAL_KEY_LABEL.test(label)) {
        return new RegExp(`(?:${INPUT_GESTURE.source}\\s+|\\b(?:key|button)\\s+)${escaped}(?![\\p{L}\\p{N}])`, 'iu');
      }
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    });
    const buttonAliases = [LMB_ALIAS, RMB_ALIAS];
    const namesInput = (description: string) =>
      [...controlPatterns, ...buttonAliases].some((pattern) => pattern.test(description)) ||
      INPUT_GESTURE.test(description);
    expect(namesInput(`Hold ${inputBindings.label('firearm.reload')} to load`)).toBe(true);
    expect(namesInput(`${inputBindings.label('ui.main-menu-toggle')} key`)).toBe(true);
    expect(namesInput('LMB fires')).toBe(true);
    expect(namesInput('AR-pattern rifle')).toBe(false);
    expect(namesInput('A magazine that holds 30 rounds.')).toBe(false);
    const offenders = [...baseRegistry.items.values()].flatMap((item) =>
      item.description !== undefined && namesInput(item.description) ? [`${item.id}: ${item.description}`] : [],
    );
    expect(offenders).toEqual([]);
  });

  it('base content has no issues', () => {
    const { registry, issues } = baseBuild;
    expect(issues).toEqual([]);
    expect(registry.blocks[0]!.id).toBe('air');
    for (const id of ['grass', 'dirt', 'stone', 'sand']) {
      expect(registry.blockIds.has(id)).toBe(true);
    }
  });

  it('requires non-amalgam zombie regions to match the anatomy keys exactly', () => {
    for (const [regionId, change] of [
      ['head', 'remove'],
      ['leftArmm', 'add'],
    ] as const) {
      expect(
        invalidZombieRegionIssues('shambler', regionId, change).some(
          ({ message }) => message === 'zombie region keys must match the model',
        ),
      ).toBe(true);
    }
  });

  it('requires unique ids within zombie attack move lists', () => {
    const zombieFile = base.find(({ source }) => source === 'zombies.json')!;
    const data = structuredClone(zombieFile.data) as {
      zombies: { id: string; attack: { moves: { id: string }[] } }[];
    };
    const {
      attack: { moves },
    } = data.zombies.find(({ attack }) => attack.moves.length > 1)!;
    moves[1]!.id = moves[0]!.id;

    expect(
      validateContent({ source: zombieFile.source, data }).some(
        ({ message }) => message === 'zombie move ids must be unique',
      ),
    ).toBe(true);
  });

  it('rejects an acidSpit ability without tunables and tunables without the ability', () => {
    const zombieFile = base.find(({ source }) => source === 'zombies.json')!;
    const issuesFor = (edit: (acid: { abilities: string[]; acidSpit?: unknown }) => void) => {
      const data = structuredClone(zombieFile.data) as {
        zombies: { id: string; abilities: string[]; acidSpit?: unknown }[];
      };
      edit(data.zombies.find(({ id }) => id === 'acid_zombie')!);
      return validateContent({ source: zombieFile.source, data }).map(({ message }) => message);
    };
    const mismatch = 'acidSpit tunables must match the acidSpit ability';

    expect(issuesFor(() => undefined)).not.toContain(mismatch);
    expect(
      issuesFor((acid) => {
        acid.acidSpit = undefined;
      }),
    ).toContain(mismatch);
    expect(
      issuesFor((acid) => {
        acid.abilities = [];
      }),
    ).toContain(mismatch);
  });

  it('keeps runner attack damage within the shambler damage ceilings', () => {
    const shambler = baseRegistry.zombies.get('shambler')!;
    const runner = baseRegistry.zombies.get('runner')!;
    const highestShamblerDamage = Math.max(...shambler.attack.moves.map(({ damage }) => damage));
    const weightedDamage = (moves: typeof shambler.attack.moves) =>
      moves.reduce((total, { damage, weight }) => total + damage * weight, 0) /
      moves.reduce((total, { weight }) => total + weight, 0);

    expect(runner.attack.moves.length).toBeGreaterThan(0);
    expect(Math.max(...runner.attack.moves.map(({ damage }) => damage))).toBeLessThanOrEqual(highestShamblerDamage);
    expect(weightedDamage(runner.attack.moves)).toBeLessThanOrEqual(weightedDamage(shambler.attack.moves));
  });

  it('rejects negative and unknown bleeding region factors', () => {
    const body = baseRegistry.body.get('player')!;
    const withRegionFactor = (regionFactor: Record<string, number>) => ({
      ...body,
      bleeding: {
        ...body.bleeding,
        tiers: body.bleeding.tiers.map((tier) => (tier.id === 'arterial' ? { ...tier, regionFactor } : tier)),
      },
    });

    expect(validateContent({ source: 'body.json', data: { body: [withRegionFactor({ torso: -0.1 })] } })).not.toEqual(
      [],
    );
    expect(validateContent({ source: 'body.json', data: { body: [withRegionFactor({ chest: 1 })] } })).not.toEqual([]);
  });

  it('rejects a heartbeat sound that is missing or has more than one variant', () => {
    const body = baseRegistry.body.get('player')!;
    const [onlyVariant] = [...baseRegistry.sounds.values()][0]!.variants;
    const single = {
      ...[...baseRegistry.sounds.values()][0]!,
      id: 'heartbeat_fixture_single',
      variants: [onlyVariant],
    };
    const pair = { ...single, id: 'heartbeat_fixture_pair', variants: [onlyVariant, onlyVariant] };
    const events = [single.id, pair.id, 'heartbeat_fixture_absent'];
    const { issues } = buildRegistry([
      {
        source: 'heartbeat-fixture.json',
        data: {
          sounds: [single, pair],
          body: events.map((event, index) => ({
            ...body,
            id: `heartbeat_fixture_${index}`,
            heartbeat: { ...body.heartbeat, sounds: { slow: event, fast: single.id } },
          })),
        },
      },
    ]);

    expect(issues.filter(({ source }) => source === 'heartbeat-fixture.json').map(({ path }) => path)).toEqual([
      'body[1].heartbeat.sounds.slow',
      'body[2].heartbeat.sounds.slow',
    ]);
  });

  it('accepts a touch slot covering some regions only, and rejects one covering none', () => {
    const body = baseRegistry.body.get('player')!;
    const handSlot = body.touchFirst.hand;
    const withoutHandSlot = Object.fromEntries(
      Object.entries(body.coverage).map(([region, slots]) => [region, slots.filter((slot) => slot !== handSlot)]),
    );
    const messages = (candidate: typeof body) =>
      validateContent({ source: 'body.json', data: { body: [candidate] } }).map(({ message }) => message);

    expect(Object.values(body.coverage).some((slots) => !slots.includes(handSlot))).toBe(true);
    expect(messages(body)).toEqual([]);
    expect(messages({ ...body, coverage: withoutHandSlot as typeof body.coverage })).toEqual([
      expect.stringContaining('touchFirst.hand must name a slot that covers some region'),
    ]);
  });

  it('requires amalgam zombie regions to match the manifest classes exactly', () => {
    for (const [regionId, change] of [
      ['member.leftLeg', 'remove'],
      ['member.leftArmm', 'add'],
    ] as const) {
      expect(
        invalidZombieRegionIssues('amalgam', regionId, change).some(
          ({ message }) => message === 'zombie region keys must match the model',
        ),
      ).toBe(true);
    }
  });

  it('keeps the thermal optic out of loot, fitting and ADS', () => {
    expect(
      [...baseRegistry.loot.values()].some((table) =>
        table.entries.some((entry) => entry.item === 'optic_digital_thermal'),
      ),
    ).toBe(false);
    const thermal = baseRegistry.items.get('optic_digital_thermal')!;
    expect(opticViewSettings(thermal, baseRegistry.models.get(thermal.model!)!)).toBeUndefined();
  });

  it('rejects a non-positive firearms skill-zero handling value', () => {
    const source = base.find((file) => file.source === 'recipes.json')!;
    const data = structuredClone(source.data) as {
      skills: { id: string; combat?: { firearms?: { skillZeroHandling?: { singleShot?: { variance?: number } } } } }[];
    };
    data.skills.find(({ id }) => id === 'firearms_combat')!.combat!.firearms!.skillZeroHandling!.singleShot!.variance =
      0;
    const { issues } = buildRegistry([{ source: source.source, data }]);
    expect(
      issues.some(
        ({ source: issueSource, path }) =>
          issueSource === source.source && path.endsWith('.combat.firearms.skillZeroHandling.singleShot.variance'),
      ),
    ).toBe(true);
  });

  it('rejects out-of-range or non-positive firearm duration curve parameters', () => {
    const source = base.find((file) => file.source === 'recipes.json')!;
    const data = structuredClone(source.data) as {
      skills: { id: string; combat?: { firearms?: Record<string, unknown> } }[];
    };
    const firearms = data.skills.find(({ id }) => id === 'firearms_combat')!.combat!.firearms!;
    firearms.reloadFactorFloor = 1.1;
    firearms.rackFactorHalfLifeLevels = 0;
    const { issues } = buildRegistry([{ source: source.source, data }]);
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.reloadFactorFloor'))).toBe(true);
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.rackFactorHalfLifeLevels'))).toBe(true);
  });

  it('rejects invalid OU wobble tuning', () => {
    const source = base.find((file) => file.source === 'recipes.json')!;
    const data = structuredClone(source.data) as {
      skills: { id: string; combat?: { firearms?: Record<string, unknown> } }[];
    };
    const firearms = data.skills.find(({ id }) => id === 'firearms_combat')!.combat!.firearms!;
    firearms.wobbleNoiseReversionRatePerSimSecond = 0;
    firearms.wobbleNoiseSigmaRadiansPerSqrtSecond = -0.01;
    firearms.wobbleNoiseSmoothingSimSeconds = 0;
    const { issues } = buildRegistry([{ source: source.source, data }]);

    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.wobbleNoiseReversionRatePerSimSecond'))).toBe(
      true,
    );
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.wobbleNoiseSigmaRadiansPerSqrtSecond'))).toBe(
      true,
    );
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.wobbleNoiseSmoothingSimSeconds'))).toBe(true);
  });

  it('rejects firearms tuning without case ejection or shot trace range', () => {
    const source = base.find((file) => file.source === 'recipes.json')!;
    const data = structuredClone(source.data) as {
      skills: { id: string; combat?: { firearms?: Record<string, unknown> } }[];
    };
    const firearms = data.skills.find(({ id }) => id === 'firearms_combat')!.combat!.firearms!;
    Reflect.deleteProperty(firearms, 'caseEjection');
    Reflect.deleteProperty(firearms, 'shotTraceRangeBlocks');
    const { issues } = buildRegistry([{ source: source.source, data }]);
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.caseEjection'))).toBe(true);
    expect(issues.some(({ path }) => path.endsWith('.combat.firearms.shotTraceRangeBlocks'))).toBe(true);
  });

  it('rejects ammunition spread or firearm choke scale that is not authored', () => {
    const files = structuredClone(base) as {
      source: string;
      data: { items?: { ammo?: Record<string, unknown>; firearm?: Record<string, unknown> }[] };
    }[];
    const items = files.flatMap(({ data }) => data.items ?? []);
    const ammunition = items.find((item) => item.ammo !== undefined)!;
    const firearm = items.find((item) => item.firearm !== undefined)!;
    Reflect.deleteProperty(ammunition.ammo!, 'spreadDegrees');
    Reflect.deleteProperty(firearm.firearm!, 'pelletSpreadScale');
    const { issues } = buildRegistry(files);
    expect(issues.some(({ path }) => path.endsWith('.ammo.spreadDegrees'))).toBe(true);
    expect(issues.some(({ path }) => path.endsWith('.firearm.pelletSpreadScale'))).toBe(true);
  });

  it('rejects firearm attachment effects without a per-shot wear', () => {
    const files = (
      structuredClone(base) as { source: string; data: { items?: { firearmAttachmentEffects?: object }[] } }[]
    ).filter(({ data }) => data.items);
    const attachment = files
      .flatMap((file) => file.data.items ?? [])
      .find((item) => item.firearmAttachmentEffects !== undefined);
    expect(attachment).toBeDefined();
    Reflect.deleteProperty(attachment!.firearmAttachmentEffects!, 'wearPerShot');
    const { issues } = buildRegistry(files);
    expect(issues.some(({ path }) => path.endsWith('.firearmAttachmentEffects.wearPerShot'))).toBe(true);
  });

  it('rejects an attachment whose model kind has effects but whose item authors none', () => {
    const data = {
      items: [
        {
          id: 'fixture_suppressor',
          economy: { usage: [], tiers: [] },
          name: 'Fixture suppressor',
          category: 'misc',
          weight: 1,
          size: [1, 2],
          model: 'fixture_suppressor',
        },
      ],
      models: [
        {
          id: 'fixture_suppressor',
          file: 'assets/models/fixture_suppressor.glb',
          gun: {
            attachment: {
              id: 'fixture-suppressor',
              kind: 'suppressor',
              mount: 'muzzle',
              mountFrame: { normal: [-1, 0, 0], up: [0, 1, 0] },
              properties: { noiseFactor: 0.25 },
            },
          },
        },
      ],
    };
    const { issues } = buildRegistry([{ source: 'effects-fixture.json', data }]);
    expect(issues.map(({ path }) => path)).toEqual(['items[0].firearmAttachmentEffects']);
  });

  it('rejects an item that lacks the handling time its kind needs', () => {
    type Raw = Record<string, unknown>;
    const at = (root: unknown, keys: string[]): unknown =>
      keys.reduce<unknown>((node, key) => (node as Raw | undefined)?.[key], root);
    // A dropped field is reported at its own path, except a food's rot fields, which are checked together on `.food`.
    const drops: { field: string; reportedAt?: string }[] = [
      { field: 'food.consumeSimSeconds' },
      { field: 'food.poisonHealth', reportedAt: '.food' },
      { field: 'analgesic.takeSimSeconds' },
      { field: 'light.power.swapSimSeconds' },
      { field: 'unpack.simSeconds' },
      { field: 'ammo.loadSimSeconds' },
      { field: 'ammo.stripSimSeconds' },
      { field: 'weapon.melee.contactFraction' },
      { field: 'weapon.melee.windupCapSimSeconds' },
      { field: 'firearm.roundLoadSimSeconds' },
      { field: 'firearm.handling.magazine' },
    ];
    // One build of the item files for all drops: each takes a distinct item that has the field, and each is reported by its own path.
    const files = (structuredClone(base) as { source: string; data: { items?: Raw[] } }[]).filter(
      ({ data }) => data.items,
    );
    const items = files.flatMap((file) => file.data.items ?? []);
    const used = new Set<Raw>();
    const dropped = drops.map(({ field, reportedAt }) => {
      const keys = field.split('.');
      const item = items.find((candidate) => !used.has(candidate) && at(candidate, keys) !== undefined);
      expect(item, field).toBeDefined();
      used.add(item!);
      Reflect.deleteProperty(at(item, keys.slice(0, -1)) as Raw, keys.at(-1)!);
      return reportedAt ?? `.${field}`;
    });
    const { issues } = buildRegistry(files);
    for (const path of dropped) {
      expect(
        issues.some((issue) => issue.path.endsWith(path)),
        path,
      ).toBe(true);
    }
  });

  it('rejects incomplete per-firearm skill-zero factors', () => {
    const issues = validateContent({
      source: 'fixture-firearm.json',
      data: {
        items: [
          firearmFixture({
            singleShot: { variance: 1, recoilKickScale: 1, recoilRecoveryScale: 1 },
          }),
        ],
      },
    });
    expect(issues.some(({ path }) => path.endsWith('.firearm.skillZeroHandling.automaticFollowup'))).toBe(true);
  });

  it('rejects a per-firearm skill-zero factor outside its supported range', () => {
    const issues = validateContent({
      source: 'fixture-firearm.json',
      data: {
        items: [
          firearmFixture({
            singleShot: { variance: 1, recoilKickScale: 101, recoilRecoveryScale: 1 },
            automaticFollowup: { variance: 1, recoilKickScale: 1, recoilRecoveryScale: 1 },
          }),
        ],
      },
    });
    expect(issues.some(({ path }) => path.endsWith('.firearm.skillZeroHandling.singleShot.recoilKickScale'))).toBe(
      true,
    );
  });

  it('rejects a negative configured light lure scale', () => {
    const sensesFile = base.find((file) => file.source === 'senses.json')!;
    const data = structuredClone(sensesFile.data) as { senses: { light: { lureRangeScale: number } }[] };
    data.senses[0]!.light.lureRangeScale = -1;

    const { issues } = buildRegistry([{ source: 'senses.json', data }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ source: 'senses.json', path: 'senses[0].light.lureRangeScale' }),
    );
  });

  it('rejects an independent dispersion cone on a pump because pellets own the cone', () => {
    const source = 'pump-dispersion-fixture.json';
    const item = {
      id: 'fixture_pump',
      name: 'Fixture pump',
      category: 'weapon',
      weight: 1,
      size: [1, 1],
      firearm: {
        pump: true,
        recoilKickRadians: 0.01,
        dispersionRadians: 0.01,
        pelletSpreadScale: 1,
        shotSound: 'gunshot',
        handling: {},
        roundLoadSimSeconds: 1,
      },
    };
    const { issues } = buildRegistry([baseSounds, { source, data: { items: [item] } }]);
    expect(issues.map(({ path }) => path)).toContain('items[0].firearm.dispersionRadians');
    const { issues: zeroConeIssues } = buildRegistry([
      baseSounds,
      { source, data: { items: [{ ...item, firearm: { ...item.firearm, dispersionRadians: 0 } }] } },
    ]);
    expect(zeroConeIssues).toEqual([]);
  });

  it('requires a firearm dispersion cone while permitting a pump with no extra cone', () => {
    const source = 'firearm-dispersion-fixture.json';
    const item = {
      id: 'fixture_firearm',
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: 'Fixture firearm',
      category: 'weapon',
      weight: 1,
      size: [1, 1],
      firearm: { recoilKickRadians: 0.01, pelletSpreadScale: 1, shotSound: 'gunshot', handling: {} },
    };
    const missing = validateContent({ source, data: { items: [item] } });
    expect(missing.map(({ path }) => path)).toContain('items[0].firearm.dispersionRadians');
    expect(
      validateContent({
        source,
        data: { items: [{ ...item, firearm: { ...item.firearm, dispersionRadians: 0 } }] },
      }),
    ).toEqual([]);
  });

  it('requires a suppressed shot sound on a firearm whose model can mount a suppressor', () => {
    const data = {
      items: [
        {
          id: 'fixture_gun',
          economy: { usage: [], tiers: [] },
          name: 'Fixture gun',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          model: 'fixture_gun',
          firearm: {
            recoilKickRadians: 0.01,
            dispersionRadians: 0,
            pelletSpreadScale: 1,
            shotSound: 'gunshot',
            handling: {},
          },
        },
        {
          id: 'fixture_suppressor',
          economy: { usage: [], tiers: [] },
          name: 'Fixture suppressor',
          category: 'misc',
          weight: 1,
          size: [1, 2],
          model: 'fixture_suppressor',
          firearmAttachmentEffects: {
            kind: 'suppressor',
            recoilReduction: 0.1,
            wearPerShot: 0.01,
            fitSkillLevel: 4,
            fitRefusal: "I can't fit this suppressor yet",
          },
        },
      ],
      models: [
        {
          id: 'fixture_gun',
          file: 'assets/models/fixture_gun.glb',
          gun: { compatibility: { 'barrel.muzzle.0': ['fixture-suppressor'] } },
        },
        {
          id: 'fixture_suppressor',
          file: 'assets/models/fixture_suppressor.glb',
          gun: {
            attachment: {
              id: 'fixture-suppressor',
              kind: 'suppressor',
              mount: 'muzzle',
              mountFrame: { normal: [-1, 0, 0], up: [0, 1, 0] },
              properties: { noiseFactor: 0.25 },
            },
          },
        },
      ],
    };
    const source = 'suppressor-fixture.json';
    expect(buildRegistry([baseSounds, { source, data }]).issues).toContainEqual({
      source,
      path: 'items[0].firearm.suppressedShotSound',
      message: 'a suppressor-mountable firearm needs a suppressed shot sound',
    });

    const suppressed = structuredClone(data) as typeof data & {
      items: { firearm?: { suppressedShotSound?: string } }[];
    };
    suppressed.items[0]!.firearm!.suppressedShotSound = 'gunshot_m4_suppressed';
    expect(buildRegistry([baseSounds, { source, data: suppressed }]).issues).toEqual([]);
  });

  it.each([SKILL_LEVEL_MIN - 1, SKILL_LEVEL_MAX + 1])(
    'rejects recipe skill level %s outside the character scale',
    (level) => {
      const issues = validateContent({
        source: 'skill-level.json',
        data: {
          skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
          recipes: [
            {
              id: 'fixture_recipe',
              result: { item: 'rag', count: 1 },
              timeGameMinutes: 1,
              skills: Object.fromEntries([['fixture_skill', level]]),
              qualities: {},
              components: [],
            },
          ],
        },
      });
      expect(issues.map(({ path }) => path)).toContain('recipes[0].skills.fixture_skill');
    },
  );

  it('rejects disassembly fractions that extend beyond the character scale', () => {
    const issues = validateContent({
      source: 'skill-fractions.json',
      data: {
        items: [
          {
            id: 'fixture_tool',
            name: 'Fixture tool',
            category: 'tool',
            weight: 1,
            size: [1, 1],
            disassembly: {
              timeGameMinutes: 1,
              skill: 'fixture_skill',
              yields: [
                {
                  item: 'rag',
                  count: 1,
                  fractions: Array.from({ length: SKILL_LEVEL_MAX + 2 }, (_, index) => index / (SKILL_LEVEL_MAX + 1)),
                  rounding: 'floor',
                },
              ],
            },
          },
        ],
      },
    });
    expect(issues.map(({ path }) => path)).toContain('items[0].disassembly.yields[0].fractions');
  });

  it('accepts restable furniture quality and rejects an out-of-range value', () => {
    const source = 'restable-furniture-fixture.json';
    const data: ContentFile = {
      furniture: [
        {
          id: 'fixture_chair',
          name: 'Chair',
          size: [1, 2, 1],
          color: '#123456',
          rest: { quality: 0.5 },
          breach: fixtureBreach(),
          material: FIXTURE_MATERIAL,
        },
        {
          id: 'fixture_sofa',
          name: 'Sofa',
          size: [4, 2, 2],
          color: '#654321',
          rest: { quality: 0.5, sleep: true },
          breach: fixtureBreach(),
          material: FIXTURE_MATERIAL,
        },
      ],
    };
    const accepted = buildRegistry([{ source, data }]);
    expect(accepted.issues).toEqual([]);
    expect(accepted.registry.furniture.has('fixture_chair')).toBe(true);
    expect(accepted.registry.furniture.has('fixture_sofa')).toBe(true);

    const invalid = structuredClone(data);
    invalid.furniture![0]!.rest!.quality = 1.5;
    const rejected = buildRegistry([{ source, data: invalid }]);
    expect(rejected.registry.furniture.has('fixture_chair')).toBe(false);
    expect(rejected.issues.length).toBeGreaterThan(0);
  });

  it('keeps every sleep surface that is carried like a rug poorer than every fixed one', () => {
    const sleepers = [...baseRegistry.furniture.values()].filter((def) => def.rest?.sleep === true);
    const carried = sleepers.filter((def) => def.cover === true);
    const fixed = sleepers.filter((def) => def.cover !== true);
    expect(carried.length).toBeGreaterThan(0);
    expect(fixed.length).toBeGreaterThan(0);
    const bestCarried = Math.max(...carried.map((def) => def.rest!.quality));
    const worstFixed = Math.min(...fixed.map((def) => def.rest!.quality));
    expect(bestCarried).toBeLessThan(worstFixed);
  });

  it('rejects furniture shape boxes that leave the footprint on each axis', () => {
    const furniture = [
      {
        id: 'fixture_furniture_x',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.5, 0.5, 0.25], size: [0.75, 0.5, 0.5] }],
        solidFill: 0.01,
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
      {
        id: 'fixture_furniture_y',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.25, 1.5, 0.25], size: [0.5, 0.75, 0.5] }],
        solidFill: 0.01,
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
      {
        id: 'fixture_furniture_z',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.25, 0.5, 0.5], size: [0.5, 0.5, 0.75] }],
        solidFill: 0.01,
        breach: fixtureBreach(),
        material: FIXTURE_MATERIAL,
      },
    ];
    const issues = validateContent({ source: 'outside-furniture-shape.json', data: { furniture } });
    expect(issues.map(({ path }) => path)).toEqual(['furniture[0]', 'furniture[1]', 'furniture[2]']);
  });

  it('rejects a disassembly yield of its own input while accepting a distinct output', () => {
    const source = 'self-yield-fixture.json';
    const data: ContentFile = {
      skills: [{ id: 'fixture_reclaiming', name: 'Fixture reclaiming' }],
      items: [
        {
          id: 'fixture_input',
          workInProgress: false,
          notLoot: false,
          economy: { usage: [], tiers: [] },
          name: 'Input part',
          category: 'tool',
          weight: 1,
          size: [1, 1],
          disassembly: {
            timeGameMinutes: gameMinutes(1),
            skill: 'fixture_reclaiming',
            yields: [{ item: 'fixture_input', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
          },
        },
        {
          id: 'fixture_output',
          workInProgress: false,
          notLoot: false,
          economy: { usage: [], tiers: [] },
          name: 'Output part',
          category: 'tool',
          weight: 1,
          size: [1, 1],
        },
      ],
    };
    const valid = structuredClone(data);
    valid.items![0]!.disassembly!.yields[0]!.item = 'fixture_output';
    const accepted = buildRegistry([{ source, data: valid }]);
    expect(accepted.issues).toEqual([]);
    expect(accepted.registry.items.has('fixture_input')).toBe(true);

    const rejected = buildRegistry([{ source, data }]);
    expect(rejected.issues).toContainEqual(
      expect.objectContaining({ source, path: 'items[0].disassembly.yields[0].item' }),
    );
    expect(rejected.registry.items.has('fixture_input')).toBe(false);
  });

  it('validates tool-quality references in disassembly yield modifiers', () => {
    const source = 'tool-quality-fixture.json';
    const { issues } = buildRegistry([
      {
        source,
        data: {
          skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
          items: [
            { id: 'fixture_output', name: 'Output', category: 'material', weight: 1, size: [1, 1] },
            {
              id: 'fixture_tool',
              name: 'Tool',
              category: 'tool',
              weight: 1,
              size: [1, 1],
              tool: { qualities: { shaping: 1 } },
              disassembly: {
                timeGameMinutes: 1,
                skill: 'fixture_skill',
                yields: [
                  {
                    item: 'fixture_output',
                    count: 1,
                    fractions: [0.5, 1],
                    rounding: 'floor',
                    toolModifier: { quality: 'unknown_quality', bonusByLevel: [0.1] },
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
    expect(issues).toContainEqual({
      source,
      path: 'items[1].disassembly.yields[0].toolModifier.quality',
      message: 'no tool quality "unknown_quality"',
    });
  });

  it('rejects books that teach a recipe absent from the merged registry', () => {
    const source = 'book-reference-fixture.json';
    const data: ContentFile = {
      items: [
        {
          id: 'book_reference_fixture',
          workInProgress: false,
          notLoot: false,
          economy: { usage: [], tiers: [] },
          name: 'Fixture manual',
          category: 'book',
          weight: 1,
          size: [1, 1],
          book: { title: 'Fixture manual', recipes: ['missing_recipe'], readingGameMinutes: gameMinutes(1) },
        },
      ],
      recipes: [
        {
          id: 'fixture_recipe',
          result: { item: 'book_reference_fixture', count: 1 },
          timeGameMinutes: gameMinutes(1),
          skills: {},
          qualities: {},
          components: [[{ item: 'book_reference_fixture', count: 1 }]],
        },
      ],
    };
    const result = buildRegistry([{ source, data }]);
    expect(result.issues).toContainEqual({
      source,
      path: 'items[0].book.recipes[0]',
      message: 'no recipe "missing_recipe"',
    });
    expect(result.registry.items.has('book_reference_fixture')).toBe(false);
  });

  it('rejects a site palette that names a missing block', () => {
    const source = 'site-generation-fixture.json';
    const data = structuredClone(base.find((file) => file.source === 'site-generation.json')!.data) as ContentFile;
    const entry = data.siteGeneration![0]!;
    entry.palette.terrain.rock = 'no_such_block';
    const { issues } = buildRegistry([{ source, data }]);
    expect(issues.map(({ path, message }) => `${path}: ${message}`)).toEqual(
      expect.arrayContaining(['siteGeneration[0].palette.terrain.rock: no block "no_such_block"']),
    );
  });

  it('rejects a registry without site generation when a site palette is read', () => {
    const { registry } = buildRegistry([]);
    expect(() => sitePalette(registry)).toThrow('Missing site generation content');
  });

  it('rejects placement loot without a container and retains the same loot when a pocket exists', () => {
    const source = 'test/fixtures/content/loot-override-no-container.json';
    const data = JSON.parse(readFileSync(source, 'utf8')) as ContentFile;
    // Valid admission on both sides isolates the container-shape contract.
    const { lootContext } = data.templates![0]!;
    data.items![0]!.economy = { usage: lootContext.usage, tiers: [lootContext.tier] };
    const rejected = buildRegistry([{ source, data }]);
    expect
      .soft(rejected.issues)
      .toEqual([{ source, path: 'templates[0].palette["Ω"].loot', message: 'has loot but no container to put it in' }]);
    expect.soft(rejected.registry.items.has('review_only_item')).toBe(false);
    // Only the container changes: shape/references and actual marked placement stay identical.
    const control = structuredClone(data);
    control.furniture![0]!.container = { pockets: [{ grid: [1, 1], handlingSimSeconds: simSeconds(1) }] };
    control.layouts = [
      {
        id: 'loot_fixture',
        lootContext,
        bounds: { x0: 0, z0: 0, x1: 16, z1: 16 },
        ground: 0,
        terrain: [],
        buildings: [{ template: 'shed', position: [0, 0, 0], rotation: 0 }],
        player: { position: [8, 0.5, 8], bearing: 0 },
        shamblers: [],
        woodlands: [],
        tracks: [],
      },
    ];
    const { registry, issues } = buildRegistry([{ source, data: control }]);
    expect(issues).toEqual([]);
    expect(checkReachability(registry).found.has('review_only_item')).toBe(true);
    const placement: Placement = {
      template: compileTemplate(registry, registry.templates.get('shed')!),
      origin: [0, 0, 0],
      turn: 0,
    };
    const spawned = furnitureOf(
      { seed: 1, registry },
      placement,
      [0, 0],
      lootPointsOf(registry, 'fixture', placement, [0, 0]),
    ).find((piece) => piece.spec.type === 'review_pedestal')!;
    expect(spawned.loot.map((item) => item.type)).toEqual(['review_only_item']);
    const inventory = new Inventory(registry);
    const entity = inventory.furnish(spawned.spec, spawned.loot)!;
    expect(entity.pockets![0]!.map((placed) => placed.item.type)).toEqual(['review_only_item']);
  });

  it('registers the machete and Kabar as cutting melee tools and makes both findable', () => {
    const registry = baseRegistry;
    const machete = registry.items.get('machete')!;
    const kabar = registry.items.get('kabar')!;
    for (const [item, model] of [
      [machete, 'machete'],
      [kabar, 'kabar'],
    ] as const) {
      expect(item).toMatchObject({ category: 'tool', model, weapon: { melee: { type: 'cut' } } });
      expect(item.tool?.qualities.cutting).toBeGreaterThan(0);
    }
    for (const id of ['machete', 'kabar']) {
      expect(registry.loot.get('shed_tools')?.entries).toContainEqual({
        item: id,
        weight: 1,
        condition: [0.4, 1],
      });
    }
  });

  it('keeps player bodily cues out of zombie-hearing noise', () => {
    const registry = baseRegistry;
    for (const id of [
      'player_nope',
      'footstep_grass',
      'footstep_mud',
      'footstep_sand',
      'footstep_stone',
      'footstep_wood',
      'footstep_leaves',
    ]) {
      const sound = registry.sounds.get(id)!;
      expect(sound.category, id).toBe('body');
      expect(sound.noise.enabled, id).toBe(false);
    }
  });

  it('validates optional per-sound wall tuning', () => {
    const sound = {
      id: 'fixture_wall_tuning',
      description: 'fixture wall tuning',
      variants: ['assets/audio/fixture.ogg'],
      gain: 0.7,
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: false, radiusMetres: 1 },
      wall: { gain: 0.3, cutoffHz: 900 },
    };
    expect(validateContent({ source: 'fixture.json', data: { sounds: [sound] } })).toEqual([]);
    const invalid = validateContent({
      source: 'fixture.json',
      data: { sounds: [{ ...sound, wall: { gain: 1.1, cutoffHz: 0 } }] },
    });
    expect(invalid.map(({ path }) => path).sort()).toEqual(['sounds[0].wall.cutoffHz', 'sounds[0].wall.gain']);
  });

  it('validates the shambler search-duration range', () => {
    const zombiePack = base.find(({ source }) => source === 'zombies.json')!;
    const data = structuredClone(zombiePack.data) as {
      zombies: Array<{ hearingModel: { searchSimSeconds: { min: number; max: number } } }>;
    };
    data.zombies[0]!.hearingModel.searchSimSeconds = { min: 51, max: 50 };
    const issues = validateContent({ source: zombiePack.source, data });
    expect(issues.map(({ message }) => message)).toContain('minimum search duration must not exceed maximum');
  });

  it('reports a missing inventory-management skill as required core content', () => {
    const withoutSkill = {
      ...baseRegistry,
      skills: new Map([...baseRegistry.skills].filter(([id]) => id !== CORE_CONTENT_IDS.inventoryManagement)),
    };
    expect(requiredContentIssues(withoutSkill)).toContainEqual({
      source: 'core content',
      path: 'skills',
      message: `missing required content "${CORE_CONTENT_IDS.inventoryManagement}"`,
    });
  });

  it('reports a missing fists melee class as a load error', () => {
    const withoutFists = {
      ...baseRegistry,
      meleeClasses: new Map([...baseRegistry.meleeClasses].filter(([id]) => id !== CORE_CONTENT_IDS.fistsMeleeClass)),
    };
    expect(requiredContentIssues(withoutFists)).toContainEqual({
      source: 'core content',
      path: 'meleeClasses',
      message: `missing required content "${CORE_CONTENT_IDS.fistsMeleeClass}"`,
    });
  });

  describe('default keys', () => {
    interface ControlRows {
      controls: { id: string; keys: { code: string; modifier?: string }[] }[];
    }
    // Control checks read only control rows, so the cases admit the controls file without the rest of base.
    const controlsFile = () => base.find(({ source }) => source === 'controls.json')!;
    const controlsIssues = (change: (rows: ControlRows['controls']) => void): string[] => {
      const file = controlsFile();
      const data = structuredClone(file.data) as ControlRows;
      change(data.controls);
      const built = buildRegistry([{ source: file.source, data }]);
      const baseSources = new Set(base.map(({ source }) => source));
      return [...built.issues, ...controlIssues(built.registry, built.origins, baseSources)].map(
        ({ message }) => message,
      );
    };

    it('accepts the base default keys', () => {
      expect(controlsIssues((rows) => rows.length)).toEqual([]);
    });

    it('refuses a controls row from a mod, since the game reads default keys from the base pack only', () => {
      const modRow = { id: 'mod.action', keys: [{ code: 'KeyJ' }] };
      const built = buildRegistry([controlsFile(), { source: 'mods/foo/controls.json', data: { controls: [modRow] } }]);
      const refused = controlIssues(built.registry, built.origins, new Set(base.map(({ source }) => source)));
      expect(refused.map(({ source }) => source)).toEqual(['mods/foo/controls.json']);
      expect(refused[0]?.message).toContain("mods can't yet");
    });

    it('reports an action left without a default key', () => {
      let removed = '';
      const messages = controlsIssues((rows) => {
        removed = rows.splice(0, 1)[0]!.id;
      });
      expect(messages).toContain(`action ${removed} has no default key`);
    });

    it('reports an action whose row has no keys once, as an action without a default key', () => {
      let emptied = '';
      const messages = controlsIssues((rows) => {
        emptied = rows[0]!.id;
        rows[0]!.keys = [];
      });
      expect(messages).toEqual([`action ${emptied} has no default key`]);
    });

    it('reports a default key for an unknown action', () => {
      expect(controlsIssues((rows) => rows.push({ id: 'movement.teleport', keys: [{ code: 'KeyZ' }] }))).toContain(
        'unknown action movement.teleport',
      );
    });

    it('reports an invalid key code', () => {
      expect(controlsIssues((rows) => rows[0]!.keys.splice(0, 1, { code: 'NotAKey' }))).toContain(
        'NotAKey: Unknown physical key',
      );
    });

    it.each(['ctrl', 'meta', 'alt'])('refuses the %s modifier in a default key', (modifier) => {
      const messages = controlsIssues((rows) => rows[0]!.keys.splice(0, 1, { code: 'KeyJ', modifier }));
      expect(messages.some((message) => message.startsWith(`${modifier}+KeyJ: `))).toBe(true);
    });

    it('reports default keys that conflict', () => {
      const messages = controlsIssues((rows) => {
        for (const row of rows) {
          row.keys = [{ code: 'KeyJ' }];
        }
      });
      expect(messages.some((message) => message.toLowerCase().includes('conflict'))).toBe(true);
    });
  });

  it('reports a missing day cycle as a load error', () => {
    expect(requiredContentIssues({ ...baseRegistry, dayCycle: undefined })).toContainEqual({
      source: 'core content',
      path: 'dayCycle',
      message: 'missing required day cycle',
    });
  });

  it('reports a missing test range as a load error', () => {
    const withoutRange = { ...baseRegistry, handlingRange: new Map() };
    expect(requiredContentIssues(withoutRange)).toContainEqual({
      source: 'core content',
      path: 'handlingRange',
      message: `missing required content "${CORE_CONTENT_IDS.testRange}"`,
    });
  });

  describe('handling range layout', () => {
    interface RangeData {
      handlingRange: { width: number; firingLine?: unknown; targets: { lateral: number }[] }[];
    }
    const rangePack = () => {
      const pack = base.find(({ source }) => source === 'range.json')!;
      return { source: pack.source, data: structuredClone(pack.data) as RangeData };
    };

    it('requires every layout field, since the code holds no defaults', () => {
      const pack = rangePack();
      pack.data.handlingRange[0]!.firingLine = undefined;
      expect(validateContent(pack).length).toBeGreaterThan(0);
    });

    it('rejects targets level with each other, since the nearer one hides the farther', () => {
      const pack = rangePack();
      const [first, second] = pack.data.handlingRange[0]!.targets;
      second!.lateral = first!.lateral;
      expect(buildRegistry([pack]).issues.map(({ message }) => message)).toContainEqual(
        expect.stringContaining('hidden from the firing line'),
      );
    });

    it('rejects a target outside the lane rather than clamping it', () => {
      const pack = rangePack();
      const layout = pack.data.handlingRange[0]!;
      layout.targets[0]!.lateral = layout.width;
      expect(buildRegistry([pack]).issues.map(({ message }) => message)).toContainEqual(
        expect.stringContaining('inside the lane width'),
      );
    });
  });

  it('reports a missing sound event even when another is defined', () => {
    const retainedId = SOUND_EVENT_IDS.at(-1)!;
    const missingId = SOUND_EVENT_IDS.find((id) => id !== retainedId);
    expect(missingId).toBeDefined();
    const registry = {
      ...baseRegistry,
      sounds: new Map([[retainedId, baseRegistry.sounds.get(retainedId)!]]),
    };
    expect(requiredContentIssues(registry)).toContainEqual({
      source: 'core content',
      path: 'sounds',
      message: `missing required sound event "${missingId}"`,
    });
  });

  // Keep this registry minimal; building the full base pack here made the suite hit its timeout.
  it('lets a later file override a block without changing its runtime id', () => {
    const original = {
      source: 'base.json',
      data: { blocks: [{ id: 'grass', name: 'Grass', color: '#6b8e4e', solid: true }] },
    };
    const mod = {
      source: 'mod.json',
      data: { blocks: [{ id: 'grass', name: 'Dead grass', color: '#8a7a40', solid: true }] },
    };
    const before = buildRegistry([original]).registry;
    const after = buildRegistry([original, mod]).registry;
    expect(after.blockIds.get('grass')).toBe(before.blockIds.get('grass'));
    expect(after.blocks[after.blockIds.get('grass')!]!.name).toBe('Dead grass');
    expect(after.blocks.length).toBe(before.blocks.length);
  });

  it('reports mistakes and skips the broken file whole', () => {
    const bad = {
      source: 'bad.json',
      data: {
        blocks: [
          { id: 'Rock', name: 'Rock', color: 'grey', solid: true, hardnes: 3 },
          { id: 'ok', name: 'Fine', color: '#ffffff', solid: true },
          { id: 'ok', name: 'Again', color: '#ffffff', solid: true },
        ],
        items: [{ id: 'x', name: 'X', category: 'misc', weight: -1 }],
        lewt: [],
      },
    };
    const { registry, issues } = buildRegistry([bad]);
    expect(issues.map((i) => i.path).sort()).toEqual([
      'blocks[0].color',
      'blocks[0].hardnes',
      'blocks[0].id',
      'items[0].size',
      'items[0].weight',
      'lewt',
    ]);
    expect(registry.blockIds.has('ok')).toBe(false);
  });

  it('requires sightCone on every zombie type', () => {
    const missingCone = {
      source: 'missing-cone.json',
      data: {
        zombies: [
          {
            id: 'missing_cone',
            name: 'Missing cone',
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.5 },
            stepLength: 0.6,
            sight: 20,
            nightSight: 10,
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            attack: {
              reach: 1,
              cooldownSimSeconds: 1.5,
              windupSimSeconds: 0.3,
              moves: [
                {
                  id: 'swipe',
                  weight: 1,
                  damage: 5,
                  damageKind: 'blunt',
                  hitRegions: [{ region: 'torso', weight: 1 }],
                },
              ],
            },
            dismember: { chance: 0.15, headOnKillChance: 0.25 },
            abilities: [],
          },
        ],
      },
    };
    expect(validateContent(missingCone).map((issue) => issue.path)).toContain('zombies[0].sightCone');
  });

  it('requires stepLength on every zombie type', () => {
    const missingStepLength = {
      source: 'missing-step-length.json',
      data: {
        zombies: [
          {
            id: 'missing_step_length',
            name: 'Missing step length',
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.5 },
            sight: 20,
            nightSight: 10,
            sightCone: 60,
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            attack: {
              reach: 1,
              cooldownSimSeconds: 1.5,
              windupSimSeconds: 0.3,
              moves: [
                {
                  id: 'swipe',
                  weight: 1,
                  damage: 5,
                  damageKind: 'blunt',
                  hitRegions: [{ region: 'torso', weight: 1 }],
                },
              ],
            },
            dismember: { chance: 0.15, headOnKillChance: 0.25 },
            abilities: [],
          },
        ],
      },
    };
    expect(validateContent(missingStepLength).map((issue) => issue.path)).toContain('zombies[0].stepLength');
  });

  it('requires figureSeeds on every zombie type but the amalgam, which must not define them', () => {
    const zombieFile = base.find((file) => file.source === 'zombies.json')!;
    interface Authored {
      model: string;
      figureSeeds?: number[] | undefined;
    }
    const issuesAfter = (model: string, change: (zombie: Authored) => void): string[] => {
      const data = structuredClone(zombieFile.data) as { zombies: Authored[] };
      change(data.zombies.find((zombie) => zombie.model === model)!);
      return validateContent({ source: zombieFile.source, data }).map((issue) => issue.path);
    };
    const seeded = (zombie: Authored) => zombie.figureSeeds!;

    expect(
      issuesAfter('shambler', (zombie) => {
        zombie.figureSeeds = undefined;
      }),
    ).toContain('zombies');
    expect(
      issuesAfter('shambler', (zombie) => {
        zombie.figureSeeds = [];
      }),
    ).not.toEqual([]);
    expect(
      issuesAfter('shambler', (zombie) => {
        zombie.figureSeeds = [seeded(zombie)[0]!, seeded(zombie)[0]!];
      }),
    ).not.toEqual([]);
    expect(
      issuesAfter('amalgam', (zombie) => {
        zombie.figureSeeds = [1];
      }),
    ).not.toEqual([]);
  });

  it('reports a duplicate id within a file', () => {
    const block = { id: 'ok', name: 'Fine', color: '#ffffff', solid: true };
    const issues = validateContent({ source: 'dup.json', data: { blocks: [block, block] } });
    expect(issues).toEqual([{ source: 'dup.json', path: 'blocks[1].id', message: 'duplicate id "ok" in this file' }]);
  });

  it('creates every descriptor registry map even when its section has no definitions', () => {
    const { registry } = buildRegistry([]);
    const sections = CONTENT_SECTION_KEYS.filter((key) => key !== 'blocks');
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(registry[section], section).toBeInstanceOf(Map);
    }
  });
});

describe('condition bands', () => {
  const baseRow = (base.find((file) => file.source === 'inventory.json')!.data as ContentFile).inventory![0]!;
  const withBands = (conditionBands: { from: number; word: string }[]) =>
    buildRegistry([{ source: 'bands.json', data: { inventory: [{ ...baseRow, conditionBands }] } }]).issues.map(
      ({ path }) => path,
    );

  it('accepts bands that start at 0 and rise', () => {
    expect(
      withBands([
        { from: 0, word: 'a' },
        { from: 0.5, word: 'b' },
      ]),
    ).toEqual([]);
  });

  it.each([
    ['a gap below the first bound', [{ from: 0.2, word: 'a' }]],
    [
      'an overlap',
      [
        { from: 0, word: 'a' },
        { from: 0.5, word: 'b' },
        { from: 0.5, word: 'c' },
      ],
    ],
    [
      'unordered bounds',
      [
        { from: 0, word: 'a' },
        { from: 0.6, word: 'b' },
        { from: 0.3, word: 'c' },
      ],
    ],
    ['no bands', []],
  ])('rejects %s', (_label, bands) => {
    expect(withBands(bands)).not.toEqual([]);
  });
});

describe('content references', () => {
  it('uses the content container-width limit and requires a reason for wider pockets', () => {
    const content = {
      inventory: [
        {
          ...(base.find((file) => file.source === 'inventory.json')!.data as ContentFile).inventory![0],
          containerMaxWidthCells: 4,
        },
      ],
      items: [
        {
          id: 'fixture_at_limit',
          name: 'At limit',
          category: 'tool',
          weight: 1,
          size: [1, 1],
          container: { pockets: [{ grid: [4, 1], handlingSimSeconds: 1 }] },
        },
        {
          id: 'fixture_too_wide',
          name: 'Too wide',
          category: 'tool',
          weight: 1,
          size: [1, 1],
          container: { pockets: [{ grid: [5, 1], handlingSimSeconds: 1 }] },
        },
      ],
      furniture: [
        {
          id: 'fixture_wide_furniture',
          name: 'Too wide',
          size: [1, 1, 1],
          color: '#ffffff',
          container: { pockets: [{ grid: [5, 1], handlingSimSeconds: 1 }] },
        },
      ],
    };
    expect(buildRegistry([{ source: 'container-width.json', data: content }]).issues.map(({ path }) => path)).toEqual([
      'items[1].container.pockets[0].grid[0]',
      'furniture[0].container.pockets[0].grid[0]',
    ]);

    const exception = {
      inventory: content.inventory,
      furniture: [
        {
          ...content.furniture[0],
          container: { ...content.furniture[0]!.container, wideReason: 'This test needs a broader fixture.' },
        },
      ],
    };
    expect(buildRegistry([{ source: 'container-width-exception.json', data: exception }]).issues).toEqual([]);
  });

  it('bounds rigid pocket dimensions and total area, but leaves soft bags unbounded', () => {
    const item = (id: string, grids: number[][], rigid?: boolean) => ({
      id,
      name: id,
      category: 'tool',
      weight: 1,
      size: [2, 3],
      container: { rigid, pockets: grids.map((grid) => ({ grid, handlingSimSeconds: 1 })) },
    });
    const items = [
      item('fixture_rotated', [[3, 2]], true),
      item('fixture_long', [[4, 1]], true),
      item(
        'fixture_sum',
        [
          [2, 2],
          [2, 2],
        ],
        true,
      ),
      item('fixture_soft', [[4, 4]]),
      item('fixture_soft_explicit', [[4, 4]], false),
      item(
        'fixture_divided',
        [
          [2, 2],
          [1, 2],
        ],
        true,
      ),
    ];
    expect(buildRegistry([{ source: 'rigid.json', data: { items } }]).issues).toEqual([
      expect.objectContaining({ path: 'items[1].container.pockets' }),
      expect.objectContaining({ path: 'items[2].container.pockets' }),
    ]);
  });

  it('refuses placement loot whose table rolls a long gun that fits none of its pockets', () => {
    const gun = { id: 'fixture_long_gun', name: 'Long gun', category: 'weapon', weight: 1, size: [2, 9] };
    const locker = (grid: [number, number]) => ({
      inventory: (base.find((file) => file.source === 'inventory.json')!.data as ContentFile).inventory,
      items: [gun],
      loot: [
        { id: 'fixture_guns', rolls: [1, 1], entries: [{ table: 'fixture_long_guns', weight: 1 }] },
        { id: 'fixture_long_guns', rolls: [1, 1], entries: [{ item: gun.id, weight: 1 }] },
      ],
      furniture: [
        {
          id: 'fixture_locker',
          name: 'Locker',
          size: [2, 4, 1],
          color: '#ffffff',
          container: { pockets: [{ grid, handlingSimSeconds: 1 }] },
        },
      ],
      templates: [
        {
          id: 'fixture_locker_template',
          size: [2, 4, 1],
          palette: { L: { furniture: 'fixture_locker', loot: 'fixture_guns' } },
          layers: [['LL'], ['LL'], ['LL'], ['LL']],
        },
      ],
    });
    const [w, h] = gun.size as [number, number];
    expect(buildRegistry([{ source: 'locker.json', data: locker([h, w]) }]).issues).toEqual([]);
    expect(buildRegistry([{ source: 'locker.json', data: locker([h - 1, h - 1]) }]).issues).toContainEqual(
      expect.objectContaining({
        path: 'templates[0].palette["L"].loot',
        message: expect.stringContaining('fits no pocket'),
      }),
    );
  });

  it('refuses a footprint shorter than its model spans between grip and anchors', () => {
    // The refusal reads only the models and the player's cell size, so the models and inventory files are enough.
    const modelPack = base.filter(({ source }) => source.startsWith('models') || source === 'inventory.json');
    const modelRegistry = buildRegistry(modelPack).registry;
    const span = (id: string) => {
      const model = modelRegistry.models.get(id)!;
      const xs = [...Object.values(model.anchors ?? {}), ...(model.grip ? [model.grip.at] : [])].map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const longest = [...modelRegistry.models.keys()].sort((a, b) => span(b) - span(a))[0]!;
    const item = { id: 'fixture_stubby', name: 'Stubby', category: 'tool', weight: 1, size: [1, 1], model: longest };
    expect(buildRegistry([...modelPack, { source: 'stubby.json', data: { items: [item] } }]).issues).toContainEqual(
      expect.objectContaining({ source: 'stubby.json', path: 'items[0].size' }),
    );
  });

  const recipeDependencies = {
    source: 'recipe-component-items.json',
    data: {
      items: [
        { id: 'rag', name: 'Rag', category: 'material', weight: 1, size: [1, 1] },
        { id: 'nails', name: 'Nails', category: 'material', weight: 1, size: [1, 1] },
      ],
      skills: [{ id: 'crafting', name: 'Crafting', training: { craftingTierOffset: 1 } }],
    },
  };

  const recipePack = {
    items: [
      {
        id: 'fixture_tool',
        name: 'Shaper',
        category: 'tool',
        weight: 1,
        size: [1, 1],
        tool: { qualities: Object.fromEntries([['custom_shaping', 1]]) },
        disassembly: {
          timeGameMinutes: 1,
          skill: 'fixture_skill',
          yields: [{ item: 'rag', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
        },
      },
    ],
    skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
    furniture: [
      {
        id: 'fixture_bench',
        name: 'Bench',
        size: [1, 1, 1],
        color: '#ffffff',
        workstation: {
          id: 'fixture_station',
          qualities: Object.fromEntries([
            ['custom_shaping', 2],
            ['fixture_sawing', 1],
          ]),
          workFactorBonus: 0.2,
        },
      },
      { id: 'fixture_plain_bench', name: 'Ordinary bench', size: [1, 1, 1], color: '#ffffff' },
    ],
    recipes: [
      {
        id: 'fixture_recipe',
        result: { item: 'fixture_tool', count: 1 },
        timeGameMinutes: 2,
        skills: Object.fromEntries([['fixture_skill', 0]]),
        qualities: Object.fromEntries([
          ['custom_shaping', 1],
          ['fixture_sawing', 1],
        ]),
        workstation: 'fixture_station',
        components: Array.from({ length: 10 }, () => [
          { item: 'rag', count: 1 },
          { item: 'nails', count: 1 },
        ]),
      },
    ],
  };

  // Skill tuning checks read only the recipe file's own skills.
  const recipeFile = () => base.find(({ source }) => source === 'recipes.json')!;

  it('rejects craftable content when the single crafting tier offset is missing', () => {
    const recipes = structuredClone(recipeFile().data) as {
      skills: { id: string; name: string; training?: unknown }[];
    };
    recipes.skills = recipes.skills.map(({ training, ...skill }) =>
      skill.id === 'crafting' ? skill : { ...skill, ...(training === undefined ? {} : { training }) },
    );
    const { issues } = buildRegistry([{ source: 'recipes.json', data: recipes }]);
    expect(
      issues.some(
        (issue) => issue.source === 'recipes.json' && issue.message.includes('missing required skill tuning'),
      ),
    ).toBe(true);
  });

  it('rejects the Inventory Management skill without its handling tuning block', () => {
    const recipes = structuredClone(recipeFile().data) as {
      skills: { id: string; inventory?: unknown }[];
    };
    recipes.skills = recipes.skills.map(({ inventory, ...skill }) =>
      skill.id === 'inventory_management' ? skill : { ...skill, ...(inventory === undefined ? {} : { inventory }) },
    );
    const { issues } = buildRegistry([{ source: 'recipes.json', data: recipes }]);
    expect(
      issues.some(
        (issue) => issue.source === 'recipes.json' && issue.message.includes('missing required skill tuning'),
      ),
    ).toBe(true);
  });

  it('rejects a handling tuning block that leaves out a weight', () => {
    const recipes = structuredClone(recipeFile().data) as {
      skills: { id: string; inventory?: Record<string, number> }[];
    };
    const tuning = recipes.skills.find(({ id }) => id === 'inventory_management')!.inventory!;
    for (const key of Object.keys(tuning).filter((name) => name !== 'handlingFactorFloor')) {
      const partial = structuredClone(recipes);
      const { [key]: _omitted, ...rest } = partial.skills.find(({ id }) => id === 'inventory_management')!.inventory!;
      partial.skills.find(({ id }) => id === 'inventory_management')!.inventory = rest;
      const { issues } = buildRegistry([{ source: 'recipes.json', data: partial }]);
      expect(
        issues.some((issue) => issue.source === 'recipes.json'),
        key,
      ).toBe(true);
    }
  });

  it('requires Inventory Management training to be untiered', () => {
    const baseActivity = baseRegistry.skills.get('inventory_management')?.training?.activities?.handling;
    expect(baseActivity?.practice).toBeDefined();
    expect(baseActivity?.tier).toBeUndefined();

    const recipes = structuredClone(recipeFile().data) as {
      skills: { id: string; training?: { activities?: Record<string, { tier?: number }> } }[];
    };
    recipes.skills.find(({ id }) => id === 'inventory_management')!.training!.activities!.handling!.tier = 1;
    const { issues } = buildRegistry([{ source: 'recipes.json', data: recipes }]);
    expect(issues.some((issue) => issue.message.includes('must be untiered'))).toBe(true);
  });

  it('validates and merges a mod recipe/skill with declared IDs at exactly 1024 alternatives', () => {
    const { registry, issues } = buildRegistry([recipeDependencies, { source: 'recipe-mod.json', data: recipePack }]);
    expect(issues).toEqual([]);
    expect(registry.recipes.get('fixture_recipe')).toEqual({
      ...recipePack.recipes[0],
      timeGameMinutes: gameMinutes(recipePack.recipes[0]!.timeGameMinutes),
    });
    expect(registry.skills.get('fixture_skill')).toEqual(recipePack.skills[0]);
  });

  it('checks result, skill, tool-quality and declared workstation references, not ordinary furniture IDs', () => {
    const data = {
      ...recipePack,
      recipes: [
        {
          ...recipePack.recipes[0]!,
          result: { item: 'missing_result', count: 1 },
          skills: Object.fromEntries([
            ['fixture_skill', 0],
            ['missing_skill', 1],
          ]),
          qualities: Object.fromEntries([
            ['custom_shaping', 1],
            ['missing_quality', 1],
          ]),
          workstation: 'fixture_plain_bench',
        },
      ],
    };
    const { registry, issues } = buildRegistry([recipeDependencies, { source: 'bad-recipe-mod.json', data }]);
    expect(issues.map(({ path, message }) => [path, message])).toEqual([
      ['recipes[0].result.item', 'no item "missing_result"'],
      ['recipes[0].skills.missing_skill', 'no skill "missing_skill"'],
      ['recipes[0].qualities.missing_quality', 'no tool quality "missing_quality"'],
      ['recipes[0].workstation', 'no workstation "fixture_plain_bench"'],
    ]);
    expect(registry.recipes.has('fixture_recipe')).toBe(false);
    expect(registry.skills.has('fixture_skill')).toBe(false);
  });

  const fixture = {
    source: 'broken-reference.json',
    data: JSON.parse(readFileSync('test/fixtures/content/broken-reference.json', 'utf8')) as unknown,
  };
  const baseContent = (source: string) => base.find((file) => file.source === source)!.data as ContentFile;
  const zombieSounds = {
    idle: 'shambler_idle',
    alert: 'shambler_alert',
    attack: 'shambler_attack',
    hurt: 'shambler_hurt',
  };
  const referenceDependencies = {
    source: 'reference-dependencies.json',
    data: {
      items: [{ id: 'fixture_non_battery', name: 'Not a battery', category: 'medical', weight: 1, size: [1, 1] }],
      skills: baseContent('recipes.json').skills!.map(({ startingRecipes: _, ...skill }) => skill),
      sounds: baseContent('sounds.json').sounds!.filter(({ id }) => Object.values(zombieSounds).includes(id)),
    },
  };
  const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

  it('requires a model material for an emissive modeled light', () => {
    const { issues } = buildRegistry([
      {
        source: 'emissive-light.json',
        data: {
          items: [
            {
              id: 'glowstick',
              name: 'Glowstick',
              category: 'light',
              weight: 1,
              size: [1, 1],
              model: 'glowstick',
              light: { radius: 1, seenFrom: 1, color: '#ffffff', intensity: 1, emissive: 1 },
            },
          ],
          models: [
            {
              id: 'glowstick',
              file: 'assets/models/glowstick.glb',
            },
          ],
        },
      },
    ]);

    expect(issues.some((issue) => issue.message === 'an emissive light model needs an emissive material')).toBe(true);
  });

  it('requires a held compass’s model to say where its display is, which way it faces and how its dial looks', () => {
    const displayIssues = (model: Record<string, unknown>) =>
      buildRegistry([
        {
          source: 'held-display.json',
          data: {
            items: [
              {
                id: 'fixture_compass',
                name: 'Fixture compass',
                category: 'tool',
                weight: 1,
                size: [1, 1],
                model: 'fixture_compass',
                heldDisplay: 'compass',
              },
            ],
            models: [{ id: 'fixture_compass', file: 'assets/models/compass.glb', ...model }],
          },
        },
      ]).issues.filter((issue) => issue.source === 'held-display.json');
    // biome-ignore lint/style/useNamingConvention: model anchors use content Ids.
    const needle = { anchors: { needle_mount: [0, 0.01, 0] } };
    const display = { at: [0, 0.01, 0], normal: [0, 1, 0], up: [0, 0, -1], size: [0.04, 0.04] };
    const dial = {
      face: 'plastic-white',
      ink: 'plastic-black',
      north: 'plastic-red',
      south: 'plastic-black',
      marks: ['N'],
      markHeight: 0.3,
      needleLength: 0.6,
      needleWidth: 0.2,
    };
    expect(displayIssues({ ...needle, dial }).map(({ message }) => message)).toEqual([
      'a held display needs a model with a display',
    ]);
    expect(displayIssues({ ...needle, display }).map(({ message }) => message)).toEqual([
      'a held compass needs a model with a dial',
    ]);
    expect(displayIssues({ ...needle, display, dial })).toEqual([]);
  });

  it('requires an explicit disassembly yield for a recipe result', () => {
    const missingYield = {
      ...structuredClone(recipePack),
      items: [Object.fromEntries(Object.entries(recipePack.items[0]!).filter(([key]) => key !== 'disassembly'))],
    };
    const source = 'missing-disassembly.json';
    const { issues } = buildRegistry([recipeDependencies, { source, data: missingYield }]);
    expect(issues).toContainEqual({
      source,
      path: 'items[0].disassembly',
      message: 'recipe result needs an explicit disassembly yield',
    });
  });

  it('reports a loot entry for a missing item, and drops the whole file', () => {
    const { registry, issues } = buildRegistry([fixture]);
    expect(issues).toEqual([
      { source: 'broken-reference.json', path: 'loot[0].entries[1].item', message: 'no item "golden_toilet"' },
    ]);
    expect(registry.items.has('fixture_trinket')).toBe(false);
    expect(registry.loot.has('fixture_drawer')).toBe(false);
  });

  it('drops files that relied on a dropped file', () => {
    const uses = {
      source: 'uses.json',
      data: { loot: [{ id: 'more', rolls: [1, 1], entries: [{ table: 'fixture_drawer', weight: 1 }] }] },
    };
    const retained = {
      source: 'retained-loot.json',
      data: {
        items: [{ id: 'retained_item', name: 'Retained', category: 'material', weight: 1, size: [1, 1] }],
        loot: [{ id: 'retained_table', rolls: [1, 1], entries: [{ item: 'retained_item', weight: 1 }] }],
      },
    };
    const { registry, issues } = buildRegistry([fixture, uses, retained]);
    expect(issues.map((i) => i.source)).toEqual(['broken-reference.json', 'uses.json']);
    expect(registry.loot.has('more')).toBe(false);
    expect(registry.loot.has('retained_table')).toBe(true);
  });

  it('finds nested loot tables that loop', () => {
    const loop = {
      source: 'loop.json',
      data: {
        loot: [
          { id: 'a', rolls: [1, 1], entries: [{ table: 'b', weight: 1 }] },
          { id: 'b', rolls: [1, 1], entries: [{ table: 'a', weight: 1 }] },
        ],
      },
    };
    const { issues } = buildRegistry([loop]);
    expect(issues.map((i) => i.message)).toContain('nested tables loop: a → b → a');
  });

  it('requires door and search action noise to select sound events with hearing noise', () => {
    const doorOpen = (base.find(({ source }) => source === 'sounds.json')!.data as ContentFile).sounds!.find(
      ({ id }) => id === 'door_open',
    )!;
    const quietDoorOpen = { ...doorOpen, noise: { ...doorOpen.noise, enabled: false } };
    const quietDoor = {
      source: 'quiet-door.json',
      data: {
        furniture: [
          {
            id: 'fixture_quiet_door',
            name: 'Fixture door',
            size: [1, 1, 1],
            color: '#333333',
            door: {
              methods: {},
              handlingSimSeconds: 0.4,
              openNoise: { sound: 'door_open' },
            },
          },
        ],
      },
    };
    const quietPile = {
      source: 'quiet-pile.json',
      data: {
        furniture: [
          {
            id: 'fixture_quiet_pile',
            name: 'Fixture pile',
            size: [1, 1, 1],
            color: '#333333',
            searchNoise: { sound: 'door_open' },
          },
        ],
      },
    };
    const { issues } = buildRegistry([
      { source: 'door-sound.json', data: { sounds: [quietDoorOpen] } },
      quietDoor,
      quietPile,
    ]);
    expect(issues).toContainEqual({
      source: 'quiet-door.json',
      path: 'furniture[0].door.openNoise.sound',
      message: 'opening sound must emit hearing noise',
    });
    expect(issues).toContainEqual({
      source: 'quiet-pile.json',
      path: 'furniture[0].searchNoise.sound',
      message: 'search sound must emit hearing noise',
    });
  });

  it('forbids ordinary salvage and recipes from producing authored Military-only supplies', () => {
    const military = militaryLootItems(baseRegistry);
    const baseFirearm = [...military]
      .map((id) => baseRegistry.items.get(id))
      .find((candidate) => candidate?.firearm !== undefined && candidate.model !== undefined);
    const baseCartridge = [...military]
      .map((id) => baseRegistry.items.get(id))
      .find((candidate) => candidate?.ammo !== undefined);
    const firearm = baseFirearm?.firearm;
    const firearmModel = baseFirearm?.model === undefined ? undefined : baseRegistry.models.get(baseFirearm.model);
    const ammo = baseCartridge?.ammo;
    if (firearm === undefined || firearmModel === undefined || ammo === undefined) {
      throw new Error('base content needs a magazine-fed firearm and matching cartridge for the fixture');
    }
    const item = 'fixture_rifle';
    const cartridge = 'fixture_cartridge';
    const armoury = {
      id: 'fixture_armoury',
      rolls: [1, 1],
      entries: [
        { item, weight: 1 },
        { item: cartridge, weight: 1 },
      ],
    };
    const source = 'military-sources.json';
    const { issues } = buildRegistry([
      baseSounds,
      {
        source: 'military-fixture.json',
        data: {
          models: [
            {
              ...firearmModel,
              id: item,
              // The fixture registers no gun-part items, so its body parts name none.
              parts: Object.fromEntries(
                Object.entries(firearmModel.parts ?? {}).map(([id, { item: _item, ...part }]) => [id, part]),
              ),
              gun: { ...firearmModel.gun, attachments: [] },
            },
          ],
          items: [
            {
              id: item,
              economy: { usage: ['Military'], tiers: ['Tier2'] },
              name: 'Fixture rifle',
              category: 'weapon',
              size: [1, 1],
              firearm,
              model: item,
            },
            {
              id: cartridge,
              economy: { usage: ['Military'], tiers: ['Tier2'] },
              name: 'Fixture cartridge',
              category: 'material',
              weight: 1,
              size: [1, 1],
              ammo,
            },
          ],
        },
      },
      {
        source,
        data: {
          loot: [
            armoury,
            {
              id: 'fixture_shed_crate',
              rolls: [1, 1],
              entries: [
                { item, weight: 1 },
                { table: armoury.id, weight: 1 },
                { item: 'fixture_rag', weight: 1 },
                { item: 'fixture_ammo_case', weight: 1 },
              ],
            },
            {
              id: 'fixture_ammo_crate',
              rolls: [1, 1],
              entries: [
                { item, weight: 1 },
                { table: armoury.id, weight: 1 },
              ],
            },
          ],
          skills: [{ id: 'fixture_crafting', name: 'Fixture crafting' }],
          items: [
            {
              id: 'fixture_scrap',
              name: 'Scrap',
              category: 'material',
              weight: 1,
              size: [1, 1],
              salvageTimeGameMinutes: gameMinutes(1),
              salvage: [{ item, count: 1 }],
            },
            {
              id: 'fixture_parts',
              name: 'Parts',
              category: 'material',
              weight: 1,
              size: [1, 1],
              disassembly: {
                timeGameMinutes: gameMinutes(1),
                skill: 'fixture_crafting',
                yields: [{ item, count: 1, fractions: [0.5, 1], rounding: 'floor' }],
              },
            },
            {
              id: 'fixture_ammo_case',
              economy: { usage: ['Military'], tiers: ['Tier2'] },
              name: 'Case',
              category: 'material',
              weight: 1,
              size: [1, 1],
              unpack: { item: 'fixture_box', count: 1, simSeconds: 1 },
            },
            {
              id: 'fixture_box',
              economy: { usage: ['Military'], tiers: ['Tier2'] },
              name: 'Box',
              category: 'material',
              weight: 1,
              size: [1, 1],
              unpack: { item: cartridge, count: 1, simSeconds: 1 },
              disassembly: {
                timeGameMinutes: gameMinutes(1),
                skill: 'fixture_crafting',
                yields: [{ item: 'fixture_rag', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
              },
            },
            { id: 'fixture_rag', name: 'Rag', category: 'material', weight: 1, size: [1, 1] },
          ],
          recipes: [
            {
              id: 'fixture_box_press',
              result: { item: 'fixture_box', count: 1 },
              timeGameMinutes: gameMinutes(1),
              components: [[{ item: 'fixture_rag', count: 1 }]],
              qualities: {},
              skills: {},
            },
          ],
        },
      },
    ]);
    const only = (id: string) => `"${id}" is military loot only`;
    expect(issues).toEqual([
      { source, path: 'items[0].salvage[0].item', message: `${only(item)}; salvage may not yield it` },
      { source, path: 'items[1].disassembly.yields[0].item', message: `${only(item)}; salvage may not yield it` },
      { source, path: 'recipes[0].result.item', message: `${only('fixture_box')}; no recipe may make it` },
    ]);
  });

  it('permits crafting and salvage of shared supplies even when Military is one authored usage', () => {
    const scrap = {
      id: 'fixture_scrap',
      name: 'Scrap',
      category: 'material',
      weight: 1,
      size: [1, 1],
      economy: { usage: ['Residential'], tiers: ['Tier1'] },
      salvageTimeGameMinutes: 1,
      salvage: [{ item: 'fixture_shared', count: 1 }],
    };
    const shared = {
      id: 'fixture_shared',
      name: 'Shared',
      category: 'material',
      weight: 1,
      size: [1, 1],
      economy: { usage: ['Residential', 'Military'], tiers: ['Tier1'] },
      disassembly: {
        timeGameMinutes: 1,
        skill: 'fixture_skill',
        yields: [{ item: scrap.id, count: 1, fractions: [0.5, 1], rounding: 'floor' }],
      },
    };
    const result = buildRegistry([
      {
        source: 'shared-fixture',
        data: {
          items: [scrap, shared],
          skills: [{ id: 'fixture_skill', name: 'Fixture' }],
          recipes: [
            {
              id: 'fixture_recipe',
              result: { item: shared.id, count: 1 },
              timeGameMinutes: 1,
              components: [[{ item: scrap.id, count: 1 }]],
              qualities: {},
              skills: {},
            },
          ],
        },
      },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.registry.recipes.has('fixture_recipe')).toBe(true);
  });

  it('rejects a salvage list without an authored work time, and a work time without a salvage list', () => {
    const fields = { category: 'material', weight: 1, size: [1, 1] };
    const { issues } = buildRegistry([
      {
        source: 'salvage-time-fixture',
        data: {
          items: [
            { id: 'fixture_untimed', name: 'Untimed', ...fields, salvage: [{ item: 'fixture_bare', count: 1 }] },
            { id: 'fixture_orphan_time', name: 'Orphan', ...fields, salvageTimeGameMinutes: 1 },
            { id: 'fixture_bare', name: 'Bare', ...fields },
          ],
        },
      },
    ]);
    expect(issues.map(({ path }) => path)).toEqual([
      'items[0].salvageTimeGameMinutes',
      'items[1].salvageTimeGameMinutes',
    ]);
  });

  it('rejects a starting recipe that names no recipe instead of dropping it', () => {
    const { issues } = buildRegistry([
      {
        source: 'starting-recipe-fixture',
        data: { skills: [{ id: 'fixture_skill', name: 'Fixture', startingRecipes: ['fixture_missing'] }] },
      },
    ]);
    expect(issues.map(({ path }) => path)).toEqual(['skills[0].startingRecipes[0]']);
  });

  it('allows tables to hold candidates without becoming a second geography authority', () => {
    const source = 'military-site.json';
    const lootId = 'fixture_military_table';
    const furniture = {
      ...structuredClone(baseRegistry.furniture.get('crate')!),
      id: 'fixture_crate',
      material: FIXTURE_MATERIAL,
    };
    const [width, height, depth] = furniture.size;
    const template = {
      id: 'fixture_nonmilitary_site',
      size: [width, height, depth],
      palette: { C: { furniture: furniture.id, loot: lootId } },
      layers: Array.from({ length: height }, () => Array.from({ length: depth }, () => 'C'.repeat(width))),
    };
    const zombie = structuredClone(baseRegistry.zombies.get('shambler')!);
    zombie.id = 'fixture_military_looter';
    zombie.severedItems = Object.fromEntries(Object.keys(zombie.regions).map((region) => [region, null]));
    zombie.loot = lootId;
    const sounds = [...new Set(Object.values(zombie.sounds))].map((id) => baseRegistry.sounds.get(id)!);
    const { quality, level } = zombie.downed!.dismember;
    const result = buildRegistry([
      {
        source,
        data: {
          items: [
            {
              id: 'fixture_military_item',
              economy: { usage: ['Military'], tiers: ['Tier2'] },
              name: 'Fixture item',
              category: 'material',
              weight: 1,
              size: [1, 1],
            },
            {
              id: 'fixture_blade',
              name: 'Fixture blade',
              category: 'tool',
              weight: 1,
              size: [1, 1],
              tool: { qualities: { [quality]: level } },
            },
          ],
          loot: [{ id: lootId, rolls: [1, 1], entries: [{ item: 'fixture_military_item', weight: 1 }] }],
          furniture: [furniture],
          templates: [template],
          zombies: [zombie],
          sounds,
        },
      },
    ]);
    expect(result.issues).toEqual([]);
  });

  it('makes every military-only item reachable from the playtest layout', () => {
    const playtest = baseRegistry.layouts.get('playtest');
    if (playtest === undefined) {
      throw new Error('base content needs the playtest layout');
    }
    const registry = { ...baseRegistry, layouts: new Map([[playtest.id, playtest]]) };
    const { found } = checkReachability(registry);
    const military = [...militaryLootItems(registry)];
    expect(military.length).toBeGreaterThan(0);
    expect(military.filter((id) => !found.has(id))).toEqual([]);
  });

  it('checks furniture, prying-skill, zombie and light references', () => {
    const mod = {
      source: 'mod.json',
      data: {
        furniture: [
          { id: 'safe', name: 'Safe', size: [1, 1, 1], color: '#333333' },
          {
            id: 'pry_door',
            name: 'Pry door',
            size: [1, 1, 1],
            color: '#333333',
            material: 'missing_material',
            door: {
              handlingSimSeconds: 0.4,
              methods: {
                pry: {
                  quality: 'prying',
                  level: 1,
                  strikeSound: 'lock_pry',
                  skill: 'missing_skill',
                  timeSimSeconds: 2,
                  fastestTimeSimSeconds: 1,
                  strikeIntervalSimSeconds: 1,
                },
              },
            },
          },
        ],
        zombies: [
          {
            id: 'clerk',
            name: 'Clerk',
            model: 'shambler',
            figureSeeds: [1],
            spawnWeight: 1,
            canJumpObstacles: true,
            strength: 1,
            sounds: zombieSounds,
            severedItems: { head: null, torso: null, leftArm: null, rightArm: null, leftLeg: null, rightLeg: null },
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.5, backgroundStepMetres: 1 },
            stepLength: 0.6,
            wander: {
              obstacleWanderChance: 0.25,
              obstacleWanderDistanceMetres: 10,
              wayAroundReachMetres: 1.5,
              wayAroundMinGainFraction: 0.25,
              idleSimSeconds: { min: 3, max: 10 },
              strollSimSeconds: { min: 3, max: 12 },
              leashMetres: 12,
              lookIntervalSimSeconds: { min: 0.8, max: 1.8 },
              bodyLookArcDegrees: 150,
              headLookArcDegrees: 100,
              bodyTurnDegreesPerSimSecond: 90,
              headTurnDegreesPerSimSecond: 120,
              movementAccelerationMetresPerSimSecondSquared: 4,
            },
            sight: 20,
            nightSight: 10,
            stimulusMemorySimSeconds: 1,
            sightCone: 60,
            eyeHeightMetres: 1.3,
            earHeightMetres: 1.3,
            hordeSpacing: { innerMetres: 0.35, stepMetres: 0.38 },
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            hearingModel: {
              farMultiplier: 2,
              bearingErrorRadians: 0.61,
              investigationDistanceMetres: 8,
              loudNoiseRadiusMetres: 10,
              hesitationSimSeconds: { min: 1, max: 1 },
              refusalSuspicionSimSeconds: 2,
              refusalLean: 0.75,
              alertCooldownSimSeconds: 10,
              chainRadiusMetres: 4,
              chainChance: 0.5,
              searchSimSeconds: { min: 40, max: 50 },
              searchRadiusMetres: 4,
              searchStrollSimSeconds: { min: 1, max: 3 },
            },
            chaseMotion: {
              swayDegrees: 25,
              swayIntervalSimSeconds: { min: 0.7, max: 1.1 },
              speedMultiplier: { min: 0.6, max: 1.2 },
              lurchSimSeconds: 1,
              stumbleChancePerSimSecond: 0.16,
              stumbleDurationSimSeconds: { min: 0.55, max: 0.75 },
              stumbleEaseSimSeconds: 0.2,
              stumbleSpeedFraction: 0.04,
              stumbleDecelerationMetresPerSimSecondSquared: 14,
            },
            attack: {
              reach: 1,
              grabBandMetres: 1.7,
              cooldownSimSeconds: 1.5,
              windupSimSeconds: 0.3,
              moves: [
                {
                  id: 'swipe',
                  motion: 'swing',
                  weight: 1,
                  damage: 5,
                  damageKind: 'blunt',
                  hitRegions: [{ region: 'torso', weight: 1 }],
                },
              ],
            },
            dismember: { chance: 0.15, headOnKillChance: 0.25 },
            downed: {
              finishOff: { simSeconds: 3 },
              dismember: { simSeconds: 15, quality: 'missing_quality', level: 1 },
            },
            abilities: [],
            loot: 'till',
          },
        ],
        items: [
          {
            id: 'torch_lamp',
            name: 'Lamp',
            category: 'light',
            weight: 300,
            size: [1, 2],
            light: {
              radius: 5,
              seenFrom: 30,
              color: '#ffffff',
              intensity: 1,
              power: { battery: 'fixture_non_battery', chargePerGameHour: 1, swapSimSeconds: 1 },
            },
          },
        ],
      },
    };
    expect(paths(buildRegistry([referenceDependencies, mod]).issues).sort()).toEqual([
      'furniture[1].door.methods.pry.skill',
      'furniture[1].door.methods.pry.strikeSound',
      'furniture[1].material',
      'items[0].light.power.battery',
      'zombies[0].downed.dismember.quality',
      'zombies[0].loot',
    ]);
  });
});

const templateZombieFile = base.find(({ source }) => source === 'zombies.json')!;
const templateShambler = {
  severedItems: Object.fromEntries(
    Object.keys(baseRegistry.zombies.get('shambler')!.regions).map((region) => [region, null]),
  ),
  ...Object.fromEntries(
    Object.entries(
      structuredClone(
        (templateZombieFile.data as { zombies: { id: string }[] }).zombies.find(({ id }) => id === 'shambler')!,
      ),
    ).filter(([key]) => key !== 'loot' && key !== 'severedItems'),
  ),
};
const templateShamblerSoundIds = new Set(
  Object.values((templateShambler as { sounds?: Record<string, string> }).sounds ?? {}),
);
const templateSoundDefinitions = (
  base.find(({ source }) => source === 'sounds.json')!.data as {
    sounds: { id: string }[];
  }
).sounds.filter(({ id }) => templateShamblerSoundIds.has(id));
const templateDismember = baseRegistry.zombies.get('shambler')!.downed!.dismember;
const templateBase = [
  {
    source: 'template-blocks.json',
    data: {
      blocks: [
        { id: 'brick', name: 'Brick', color: '#ffffff', solid: true },
        { id: 'planks', name: 'Planks', color: '#ffffff', solid: true },
        { id: 'window_frame', name: 'Window frame', color: '#ffffff', solid: true },
      ],
    },
  },
  {
    source: 'template-support.json',
    data: {
      furniture: [
        { id: 'fixture_door', name: 'Door', size: [1, 1, 1], color: '#7a5534' },
        { id: 'crate', name: 'Crate', size: [2, 2, 2], color: '#7a5534' },
      ],
      items: [
        {
          id: 'blade',
          name: 'Blade',
          category: 'tool',
          weight: 100,
          size: [1, 1],
          tool: { qualities: { [templateDismember.quality]: templateDismember.level } },
        },
      ],
    },
  },
  ...(templateSoundDefinitions.length > 0
    ? [{ source: 'template-sounds.json', data: { sounds: templateSoundDefinitions } }]
    : []),
  { source: 'template-zombies.json', data: { zombies: [templateShambler] } },
];

describe('zombie voice references', () => {
  const voiceSound = { ...templateSoundDefinitions[0]!, id: 'fixture_voice' };
  const voiced = (sounds: Record<string, string>) =>
    buildRegistry([
      ...templateBase.filter(({ source }) => source !== 'template-zombies.json'),
      { source: 'voice-sound.json', data: { sounds: [voiceSound] } },
      { source: 'voice-zombie.json', data: { zombies: [{ ...templateShambler, id: 'fixture_voiced', sounds }] } },
    ]).issues.map(({ path, message }) => `${path}: ${message}`);
  const voices = (attack: string) => ({
    idle: 'fixture_voice',
    alert: 'fixture_voice',
    attack,
    hurt: 'fixture_voice',
  });

  it('accepts an authored sound id as a zombie voice, so a new voice needs content only', () => {
    expect(voiced(voices('fixture_voice'))).toEqual([]);
  });

  it('rejects a zombie voice that names no sound', () => {
    expect(voiced(voices('fixture_missing_voice'))).toEqual([
      'zombies[0].sounds.attack: no sound event "fixture_missing_voice"',
    ]);
  });
});

describe('templates', () => {
  const template = (layers: string[][], palette: Record<string, unknown>, size = [3, layers.length, 2]) => ({
    source: 'tpl.json',
    data: { templates: [{ id: 'hut', size, palette, layers }] },
  });
  const check = (t: { source: string; data: unknown }) =>
    buildRegistry([...templateBase, t]).issues.map((i) => `${i.path}: ${i.message}`);

  it('reports spatial template issues during registry validation', () => {
    const wall = ['#####', '#...#', '#...#', '#...#', '#####'];
    const sealed = {
      source: 'sealed-entrance.json',
      data: {
        templates: [
          {
            id: 'sealed_entrance',
            size: [5, 5, 5],
            palette: { '#': 'brick', '.': 'air' },
            layers: [
              ['#####', '#####', '#####', '#####', '#####'],
              wall,
              wall,
              wall,
              ['.....', '.....', '.....', '.....', '.....'],
            ],
            access: {
              ground: 'ground',
              entrance: [2.5, 1, 2.5],
              storeys: [{ id: 'ground', floor: 1 }],
              stairs: [],
            },
          },
        ],
      },
    };
    expect(buildRegistry([...templateBase, sealed]).issues).toContainEqual({
      source: 'sealed-entrance.json',
      path: 'templates[0].access.entrance',
      message: 'entrance must reach a standing opening at the footprint edge on the ground storey',
    });
  });

  it('keeps upright doors on template outer faces passable when opened', () => {
    const exteriorDoors = [...baseRegistry.templates.values()].flatMap((definition) => {
      const compiled = compileTemplate(baseRegistry, definition);
      const [width, , depth] = compiled.size;
      return compiled.pieces.filter((piece) => {
        const furniture = baseRegistry.furniture.get(piece.furniture)!;
        if (!furniture.door || furniture.door.hatch) {
          return false;
        }
        const [x, , z] = piece.pos;
        return x === 0 || z === 0 || x + piece.size[0] === width || z + piece.size[2] === depth;
      });
    });
    expect(exteriorDoors.length).toBeGreaterThan(0);
    for (const piece of exteriorDoors) {
      // A container front opens but keeps its body solid, sealing an exterior passage.
      expect(isBodyDoor(baseRegistry.furniture.get(piece.furniture)!), piece.furniture).toBe(false);
    }
  });

  it('leaves an open air cell beside every window-frame run', () => {
    const frameRuns = [...baseRegistry.templates.values()].flatMap((definition) => {
      const frame = Object.entries(definition.palette).find(([, value]) => value === 'window_frame')?.[0];
      if (frame === undefined) {
        return [];
      }
      const air = Object.entries(definition.palette).find(([, value]) => value === 'air')?.[0];
      expect(air, `${definition.id} window palette`).toBeDefined();
      if (air === undefined) {
        return [];
      }
      return windowFrameRuns(definition, frame).map((run) => ({ definition, run, air }));
    });
    expect(frameRuns.length).toBeGreaterThan(0);
    for (const { definition, run, air } of frameRuns) {
      expect(
        runHasAirOpening(definition, run, air),
        `${definition.id} window-frame run at layer ${run.y}, row ${run.z}`,
      ).toBe(true);
    }
  });

  it('accepts a well-formed template', () => {
    const t = template(
      [
        ['###', '#.#'],
        ['#D#', '#.#'],
      ],
      { '#': 'brick', '.': 'air', D: { furniture: 'fixture_door' } },
    );
    const doors = {
      source: 'doors.json',
      data: {
        furniture: [
          {
            id: 'fixture_door',
            name: 'Door',
            size: [1, 1, 1],
            color: '#7a5534',
            door: {
              methods: {},
              handlingSimSeconds: 0.5,
            },
          },
        ],
      },
    };
    expect(buildRegistry([...base, doors, t]).issues).toEqual([]);
  });

  it('validates optional windows on template spawn markers', () => {
    const issues = check(
      template(
        [
          ['FFZ', 'FFA'],
          ['FFB', 'FF.'],
        ],
        {
          '.': 'air',
          F: { furniture: 'crate', window: { fromGameTimeOfDay: 'dusk' } },
          Z: { spawn: 'shambler', window: { fromGameTimeOfDay: 'dusk', toGameTimeOfDay: '06:30' } },
          A: { spawn: 'shambler', window: { fromGameTimeOfDay: 'sunset' } },
          B: { spawn: 'shambler', window: { fromGameTimeOfDay: 'dusk', toGameTimeOfDay: 'dusk' } },
        },
        [3, 2, 2],
      ),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('from and to must differ'),
        expect.stringContaining('window" only goes with "spawn'),
      ]),
    );
    expect(issues.some((issue) => issue.includes('palette["A"]'))).toBe(true);
    expect(issues.some((issue) => issue.includes('palette["Z"]'))).toBe(false);
  });

  it('reports open floor-course wall cells without flagging doors or window frames', () => {
    const palette = {
      '#': 'brick',
      p: 'planks',
      '.': 'air',
      D: { furniture: 'fixture_door' },
      w: 'window_frame',
    };
    const valid = template(
      [
        ['###', '###', '###'],
        ['D#w', '#p#', '###'],
        ['###', '###', '###'],
      ],
      palette,
      [3, 3, 3],
    );
    expect(check(valid)).toEqual([]);

    const broken = structuredClone(valid);
    broken.data.templates[0]!.layers[1]![0] = 'D.w';
    expect(check(broken)).toContain(
      'templates[0].layers[1]: has an open exterior cell between matching "brick" wall courses',
    );
  });

  it('checks layer sizes and that characters are in the palette', () => {
    expect(check(template([['###', '#?#'], ['##']], { '#': 'brick' }))).toEqual([
      'templates[0].layers[0][1]: "?" is not in the palette',
      'templates[0].layers[1]: has 1 rows; size[2] is 2',
      'templates[0].layers[1][0]: has 2 cells; size[0] is 3',
    ]);
  });

  it('checks palette references', () => {
    const t = template([['abc', 'abc']], {
      a: 'unobtainium',
      b: { spawn: 'ghost' },
      c: { furniture: 'throne', loot: 'hoard' },
    });
    expect(check(t)).toEqual([
      'templates[0].palette["a"]: no block "unobtainium"',
      'templates[0].palette["b"].spawn: no zombie type "ghost"',
      'templates[0].palette["c"].furniture: no furniture "throne"',
      'templates[0].palette["c"].loot: no loot table "hoard"',
    ]);
  });

  it('requires a solid host behind every wall mount in its palette facing', () => {
    const plaques = {
      source: 'wall-mount-fixture.json',
      data: {
        furniture: [
          {
            id: 'fixture_plaque',
            name: 'Fixture plaque',
            size: [1, 1, 1],
            color: '#99794c',
            mount: 'wall',
            solid: false,
            shape: [{ position: [0, 0, 0.875], size: [1, 1, 0.125] }],
          },
        ],
      },
    };
    for (const [facing, rows] of [
      ['n', ['...', '.P.', '.#.']],
      ['e', ['...', '#P.', '...']],
      ['s', ['.#.', '.P.', '...']],
      ['w', ['...', '.P#', '...']],
    ] as const) {
      const t = template(
        [[...rows]],
        { '.': 'air', '#': 'brick', P: { furniture: 'fixture_plaque', facing } },
        [3, 1, 3],
      );
      expect(buildRegistry([...templateBase, plaques, t]).issues).toEqual([]);
      t.data.templates[0]!.palette['#'] = 'air';
      expect(buildRegistry([...templateBase, plaques, t]).issues).toContainEqual({
        source: t.source,
        path: 'templates[0].palette["P"].furniture',
        message: 'wall mount at [1, 0, 1] needs a solid block behind its back face',
      });
    }
    expect(
      validateContent({
        source: plaques.source,
        data: { furniture: [{ ...plaques.data.furniture[0], mount: 'ceiling' }] },
      }),
    ).toContainEqual(expect.objectContaining({ path: 'furniture[0].mount' }));
  });

  it('needs every furniture mark to belong to a whole piece', () => {
    // A 2-wide crate marked on one cell only.
    const t = template([['C..', '...']], { C: { furniture: 'crate' }, '.': 'air' }, [3, 1, 2]);
    expect(check(t)).toEqual([
      'templates[0].palette["C"].furniture: the piece at [0, 0, 0] needs 2 × 2 × 2 cells marked "C"',
    ]);
  });

  it('explains a bad palette entry', () => {
    const t = template([['a']], { a: { furniture: 'crate', chance: 2 } }, [1, 1, 1]);
    expect(check(t)).toEqual([
      'templates[0].palette["a"].chance: must be 0 to 1',
      'templates[0].palette["a"]: "chance" only goes with "spawn"',
    ]);
  });
});

describe('content', () => {
  it('turns block colours into bytes', () => {
    const { registry } = buildRegistry([
      { source: 'a', data: { blocks: [{ id: 'r', name: 'R', color: '#ff8001', solid: true }] } },
    ]);
    expect([...blockColors(registry)]).toEqual([0, 0, 0, 255, 128, 1]);
  });

  it('turns block patterns into ids, none when omitted', () => {
    const { registry, issues } = buildRegistry([
      {
        source: 'a',
        data: {
          blocks: [
            { id: 'b', name: 'B', color: '#ffffff', solid: true, pattern: 'brick' },
            { id: 'p', name: 'P', color: '#ffffff', solid: true },
            { id: 'n', name: 'N', color: '#ffffff', solid: true, pattern: 'noise' },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    expect([...blockPatterns(registry)]).toEqual([
      0,
      BLOCK_PATTERNS.indexOf('brick'),
      0,
      BLOCK_PATTERNS.indexOf('noise'),
    ]);
  });

  it('rejects held-display capabilities without a renderer', () => {
    const items = ['watch', 'map'].map((heldDisplay, index) => ({
      id: `unrendered_display_${index}`,
      workInProgress: false,
      notLoot: false,
      economy: { usage: [], tiers: [] },
      name: 'Unrendered display',
      category: 'material',
      weight: 1,
      size: [1, 1],
      heldDisplay,
    }));
    const issues = validateContent({ source: 'held-display-fixture.json', data: { items } });
    expect(issues.map(({ path }) => path)).toEqual(['items[0].heldDisplay', 'items[1].heldDisplay']);
  });

  it('reports an unknown block pattern like any other content error', () => {
    const issues = validateContent({
      source: 'a.json',
      data: { blocks: [{ id: 'x', name: 'X', color: '#ffffff', solid: true, pattern: 'marble' }] },
    });
    expect(issues.map((i) => i.path)).toEqual(['blocks[0].pattern']);
  });

  it('feeds registry camo overrides into the compiled chunk shader uniforms', () => {
    expect(() => camoShaderConfig([])).not.toThrow();
    const camo = baseRegistry.blocks.find(({ pattern }) => pattern === 'camo')!;
    const baseBlocks = base.find(({ source }) => source === 'blocks.json')!;
    const palette = ['#123456', '#234567', '#345678', '#456789'] as const;
    const { registry, issues } = buildRegistry([
      baseBlocks,
      baseSounds,
      {
        source: 'mod-camo.json',
        data: { blocks: [{ ...camo, color: '#56789a', patternPalette: palette, patternWashout: 0.37 }] },
      },
    ]);
    expect(issues).toEqual([]);
    const meshes = new ChunkMeshes(0.5, registry);
    const shader = {
      uniforms: {},
      vertexShader: ShaderLib.lambert.vertexShader,
      fragmentShader: ShaderLib.lambert.fragmentShader,
    } as WebGLProgramParametersWithUniforms;
    meshes.material.onBeforeCompile(shader, {} as WebGLRenderer);
    const paletteInput = shader.uniforms.uCamoPalette!.value as Vector3[];
    expect(paletteInput.map((color) => color.toArray())).toEqual([
      [18 / 255, 52 / 255, 86 / 255],
      [35 / 255, 69 / 255, 103 / 255],
      [52 / 255, 86 / 255, 120 / 255],
      [69 / 255, 103 / 255, 137 / 255],
    ]);
    expect(shader.uniforms.uCamoWashout!.value).toBe(0.37);
    expect((shader.uniforms.uCamoBaseColor!.value as Vector3).toArray()).toEqual([86 / 255, 120 / 255, 154 / 255]);
  });

  it('rejects camo blocks with missing shader settings or a conflicting second palette', () => {
    const camo = baseRegistry.blocks.find(({ pattern }) => pattern === 'camo')!;
    const { patternPalette: _palette, ...withoutPalette } = camo;
    const noPalette = { ...withoutPalette, id: 'test_camo_no_palette' };
    const { patternWashout: _washout, ...withoutWashout } = camo;
    const noWashout = { ...withoutWashout, id: 'test_camo_no_washout' };
    const baseBlocks = base.find(({ source }) => source === 'blocks.json')!;
    const issues = buildRegistry([
      baseBlocks,
      baseSounds,
      {
        source: 'camo-contract.json',
        data: {
          blocks: [
            noPalette,
            noWashout,
            { ...camo, id: 'test_camo_palette_variant', patternPalette: ['#123456', '#123456', '#123456', '#123456'] },
            { ...camo, id: 'test_camo_washout_variant', patternWashout: 0.1 },
          ],
        },
      },
    ]).issues.filter(({ source }) => source === 'camo-contract.json');
    expect(issues).toHaveLength(4);
    expect(new Set(issues.map(({ path }) => path.split('.').at(-1)))).toEqual(
      new Set(['patternPalette', 'patternWashout']),
    );
    expect(
      issues.filter(({ path }) => ['blocks[2].patternPalette', 'blocks[3].patternWashout'].includes(path)),
    ).toHaveLength(2);
  });

  it('gives every base block a known pattern', () => {
    const patterns = blockPatterns(baseRegistry);
    expect(patterns).toHaveLength(baseRegistry.blocks.length);
    for (const [index, block] of baseRegistry.blocks.entries()) {
      expect(BLOCK_PATTERNS[patterns[index]!], block.id).toBeDefined();
    }
  });

  it('reports a figure whose model, joint anchor, arm or leg rig part or pivot is missing, or whose view shoulder is misplaced', () => {
    const figuresFile = base.find(({ source }) => source === 'figures-player.json')!;
    interface Part {
      model: string;
      joint: string;
      joints: Record<string, string>;
    }
    interface Rig {
      fore: { part: string; pivot: string };
      hand: { part: string; pivot: string };
      shoulderFromEye: [number, number, number];
    }
    const player = (figuresFile.data as { figures: Record<string, unknown>[] }).figures[0]!;
    const body = player.body as Part;
    const limbs = player.limbs as Record<string, Part>;
    const rig = player.armRig as Rig;
    const legRig = player.legRig as { shin: { part: string; pivot: string } };
    // One build for all fixture figures; each fixture breaks one reference, at its own path.
    const figures = [
      { body: { ...body, model: 'fixture_missing_model' } },
      { body: { ...body, joints: { ...body.joints, leftHip: 'fixture_missing_anchor' } } },
      { limbs: { ...limbs, rightArm: { ...limbs.rightArm!, joint: 'fixture_missing_anchor' } } },
      { armRig: { ...rig, fore: { ...rig.fore, part: 'fixture_missing_part' } } },
      { armRig: { ...rig, hand: { ...rig.hand, pivot: 'fixture_missing_anchor' } } },
      {
        armRig: { ...rig, shoulderFromEye: [-rig.shoulderFromEye[0], rig.shoulderFromEye[1], rig.shoulderFromEye[2]] },
      },
      { legRig: { ...legRig, shin: { ...legRig.shin, part: 'fixture_missing_part' } } },
    ].map((change, index) => ({ ...player, ...change, id: `fixture_figure_${index}` }));
    // Only the models the figure row names: building the full base pack here made the test hit its timeout.
    const figureModelIds = new Set([body.model, ...Object.values(limbs).map(({ model }) => model)]);
    const models = base.flatMap(
      ({ data }) => (data as { models?: { id: string }[] }).models?.filter(({ id }) => figureModelIds.has(id)) ?? [],
    );
    expect(models.map(({ id }) => id).sort()).toEqual([...figureModelIds].sort());
    const paths = buildRegistry([
      { source: 'figure-models.json', data: { models } },
      { source: figuresFile.source, data: { figures: [player, ...figures] } },
    ]).issues.map(({ path }) => path);
    // Both arms share the arm rig and both legs the leg rig, so a broken rig name is reported once per limb.
    expect(paths).toEqual([
      'figures[1].body.model',
      'figures[2].body.joints.leftHip',
      'figures[3].limbs.rightArm.joint',
      'figures[4].armRig.fore.part',
      'figures[4].armRig.fore.part',
      'figures[5].armRig.hand.pivot',
      'figures[5].armRig.hand.pivot',
      'figures[6].armRig.shoulderFromEye',
      'figures[7].legRig.shin.part',
      'figures[7].legRig.shin.part',
    ]);
  });

  it('reports a two-handed firearm without authored hands, a seat left of the eye and a palm not square to its fingers', () => {
    const firearmsFile = base.find(({ source }) => source === 'models-firearms.json')!;
    interface Hold {
      palm: [number, number, number];
      fingers: [number, number, number];
    }
    interface Hands {
      seat: [number, number, number];
      firing: Hold;
    }
    const data = firearmsFile.data as { items: Record<string, unknown>[]; models: Record<string, unknown>[] };
    const gun = data.items.find((item) => item.firearm && item.twoHanded)!;
    const model = data.models.find(({ id }) => id === gun.model)!;
    const hands = model.hands as Hands;
    const { hands: _hands, ...bare } = model;
    const models = [
      { ...bare, id: 'fixture_no_hands' },
      { ...model, id: 'fixture_seat', hands: { ...hands, seat: [-hands.seat[0], hands.seat[1], hands.seat[2]] } },
      { ...model, id: 'fixture_palm', hands: { ...hands, firing: { ...hands.firing, fingers: hands.firing.palm } } },
    ];
    const items = [
      { ...gun, id: 'fixture_no_hands_gun', name: 'Fixture gun', model: 'fixture_no_hands', notLoot: true },
    ];
    // Map and site sections cost most of a full build and no hands check reads them, so the build leaves them out.
    // Keys then miss the doors those sections hold; the baseline build without the fixtures reports the same misses.
    const worldSections = new Set([
      'templates',
      'layouts',
      'mapPieces',
      'mapAssemblies',
      'mapPools',
      'mapStyles',
      'scenarios',
      'siteGeneration',
      'cityBenchmarks',
    ]);
    const sources = base.map(({ source, data: content }) => ({
      source,
      data: Object.fromEntries(Object.entries(content as object).filter(([section]) => !worldSections.has(section))),
    }));
    // The fixtures live in their own file, so dropping it on their issues leaves the rest of the content as it was.
    const fixtureSource = 'hands-fixture.json';
    const baseline = buildRegistry(sources).issues;
    const { issues } = buildRegistry([...sources, { source: fixtureSource, data: { items, models } }]);
    expect(issues.filter((issue) => issue.source === fixtureSource).map(({ path }) => path)).toEqual([
      'items[0].model',
      'models[1].hands.seat',
      'models[2].hands.firing',
    ]);
    expect(issues.filter((issue) => issue.source !== fixtureSource)).toEqual(baseline);
  });

  it('gives a long gun the pistol-grip hold when gungen exports a grip part and the stock-wrist hold when it exports a stock and no grip', () => {
    const longGuns = [...baseRegistry.models.values()]
      .filter((model) => model.hands)
      .map((model) => ({
        id: model.id,
        pose: model.hands!.firing.pose,
        grip: model.parts?.grip !== undefined,
        stock: model.parts?.stock !== undefined,
      }));
    expect(longGuns.some(({ pose }) => pose === 'pistolGrip')).toBe(true);
    expect(longGuns.some(({ pose }) => pose === 'stockWrist')).toBe(true);
    // Each hold names the exported part it closes on, so the hold is read back from the parts, not from a default.
    expect(
      longGuns.map(({ id, pose }) => ({ id, pistolGrip: pose === 'pistolGrip', stockWrist: pose === 'stockWrist' })),
    ).toEqual(longGuns.map(({ id, grip, stock }) => ({ id, pistolGrip: grip, stockWrist: stock && !grip })));
  });

  it('rejects a long gun whose export has neither a grip part nor a stock part', () => {
    expect(() => compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/long-gun-no-kind.jsonnet')).toThrow(
      NO_FIRING_HOLD_KIND,
    );
  });

  it('maps each authored pattern to its own pattern id, and none for a block that authors none', () => {
    const plain = baseRegistry.blocks.find(({ pattern }) => pattern === undefined)!;
    const { pattern: _pattern, patternPalette: _palette, patternWashout: _washout, ...template } = plain;
    // Camo also needs shader settings, which the camo tests above cover.
    const authored = BLOCK_PATTERNS.filter((pattern) => pattern !== 'camo');
    const { registry, issues } = buildRegistry([
      base.find(({ source }) => source === 'blocks.json')!,
      baseSounds,
      {
        source: 'pattern-fixture.json',
        data: {
          blocks: [
            { ...template, id: 'fixture_unpatterned' },
            ...authored.map((pattern) => ({ ...template, id: `fixture_${pattern}`, pattern })),
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const patternOf = (id: string) => BLOCK_PATTERNS[blockPatterns(registry)[registry.blockIds.get(id)!]!];
    expect(patternOf('fixture_unpatterned')).toBe('none');
    for (const pattern of authored) {
      expect(patternOf(`fixture_${pattern}`)).toBe(pattern);
    }
  });
});
