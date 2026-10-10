import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShaderLib, type Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { blockColors, buildRegistry, requiredSoundIssues, validateContent } from '../src/core/content.ts';
import { ordinaryHamletSpawnWeights } from '../src/core/hamlet.ts';
import { Inventory } from '../src/core/inventory.ts';
import { militaryLootItems } from '../src/core/magazine.ts';
import { blockPatterns, blockWeatherability } from '../src/core/meshInput.ts';
import { opticViewSettings } from '../src/core/opticView.ts';
import { checkReachability } from '../src/core/reachability.ts';
import { BLOCK_PATTERNS, CONTENT_SECTION_KEYS, type ContentFile, type TemplateDef } from '../src/core/schema.ts';
import { furnitureOf } from '../src/core/site.ts';
import { templateSpawnClearanceIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate, type Placement } from '../src/core/templates.ts';
import { gameMinutes, simSeconds } from '../src/core/time.ts';
import { DEFAULT_WEATHERING_PROFILE_ID, WEATHERING_RANGES } from '../src/core/weather.ts';
import { terrainBlockIds } from '../src/core/worldgen.ts';
import { INPUT_BINDINGS, inputBindings, POINTER_ACTIONS } from '../src/game/inputBindings.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { camoShaderConfig } from '../src/render/surfacePatterns.ts';

const BASE = 'src/content/base';
const CONTEXTUAL_KEY_LABEL = /^(?:[A-Za-z]+|[0-9]|[^\p{L}\p{N}\s]+)$/u;
const INPUT_GESTURE =
  /\b(?:hold|press|tap|click|double[ -]press|wield|activate|throw|scroll|wheel|drag|rotate|snap|spawn)\b/i;
const LMB_ALIAS = /\bLMB\b/i;
const RMB_ALIAS = /\bRMB\b/i;
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown }));
const baseBuild = buildRegistry(base);
const baseRegistry = baseBuild.registry;
const missingSoundsRegistry = { ...baseRegistry, sounds: new Map() };
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
  const terrainIds = Object.values(terrainBlockIds((id) => baseRegistry.blockIds.get(id)!));
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
  firearm: { recoilKickRadians: 0.01, dispersionRadians: 0, skillZeroHandling },
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
  it('rejects a template marker whose zombie envelope intersects a solid', () => {
    const fixture: TemplateDef = {
      id: 'spawn_clearance_fixture',
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
    expect(templateSpawns.some((id) => id.startsWith('camp_'))).toBe(true);
    expect(templateSpawns.every((id) => id.startsWith('camp_'))).toBe(true);
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

  it('excludes authored-only kinds from ordinary hamlet spawn weights', () => {
    const soldier = baseRegistry.zombies.get('military_shambler')!;
    expect(ordinaryHamletSpawnWeights(baseRegistry).has(soldier.id)).toBe(false);
  });

  it('keeps the base day cycle authoritative over mod overrides', () => {
    const baseCycle = baseRegistry.dayCycle!;
    const modCycle = {
      ...baseCycle,
      latitudeDegrees: baseCycle.latitudeDegrees > 80 ? baseCycle.latitudeDegrees - 7 : baseCycle.latitudeDegrees + 7,
    };
    const { registry } = buildRegistry([
      { source: 'base/dayCycle.json', data: { dayCycle: baseCycle } },
      { source: 'mod/dayCycle.json', data: { dayCycle: modCycle } },
    ]);
    expect(registry.dayCycle).toEqual(baseCycle);
  });

  it('keeps input instructions out of item descriptions', () => {
    const bindingLabels = [
      ...INPUT_BINDINGS.flatMap((binding) =>
        binding.defaults.map((_, index) => inputBindings.alternativeLabel(binding.id, index).split(' + ').at(-1)!),
      ),
      ...POINTER_ACTIONS.map(({ label }) => label),
    ];
    const controlPatterns = [...new Set(bindingLabels)].map((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s+');
      if (CONTEXTUAL_KEY_LABEL.test(label)) {
        return new RegExp(`(?:${INPUT_GESTURE.source}\\s+|\\b(?:key|button)\\s+)${escaped}(?![\\p{L}\\p{N}])`, 'iu');
      }
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    });
    const buttonAliases = POINTER_ACTIONS.flatMap(({ id }) => {
      if (id === 'hand.use-dominant') {
        return [LMB_ALIAS];
      }
      if (id === 'stance.ready') {
        return [RMB_ALIAS];
      }
      return [];
    });
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
      firearm: { pump: true, recoilKickRadians: 0.01, dispersionRadians: 0.01 },
    };
    const { issues } = buildRegistry([{ source, data: { items: [item] } }]);
    expect(issues.map(({ path }) => path)).toContain('items[0].firearm.dispersionRadians');
    const { issues: zeroConeIssues } = buildRegistry([
      { source, data: { items: [{ ...item, firearm: { ...item.firearm, dispersionRadians: 0 } }] } },
    ]);
    expect(zeroConeIssues).toEqual([]);
  });

  it('requires a firearm dispersion cone while permitting a pump with no extra cone', () => {
    const source = 'firearm-dispersion-fixture.json';
    const item = {
      id: 'fixture_firearm',
      name: 'Fixture firearm',
      category: 'weapon',
      weight: 1,
      size: [1, 1],
      firearm: { recoilKickRadians: 0.01 },
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
        { id: 'fixture_chair', name: 'Chair', size: [1, 2, 1], color: '#123456', rest: { quality: 0.5 } },
        { id: 'fixture_sofa', name: 'Sofa', size: [4, 2, 2], color: '#654321', rest: { quality: 0.5, sleep: true } },
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

  it('rejects furniture shape boxes that leave the footprint on each axis', () => {
    const furniture = [
      {
        id: 'fixture_furniture_x',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.5, 0.5, 0.25], size: [0.75, 0.5, 0.5] }],
      },
      {
        id: 'fixture_furniture_y',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.25, 1.5, 0.25], size: [0.5, 0.75, 0.5] }],
      },
      {
        id: 'fixture_furniture_z',
        name: 'Fixture furniture',
        size: [1, 2, 1],
        color: '#123456',
        shape: [{ position: [0.25, 0.5, 0.5], size: [0.5, 0.5, 0.75] }],
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
          name: 'Fixture input',
          category: 'tool',
          weight: 1,
          size: [1, 1],
          disassembly: {
            timeGameMinutes: gameMinutes(1),
            skill: 'fixture_reclaiming',
            yields: [{ item: 'fixture_input', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
          },
        },
        { id: 'fixture_output', name: 'Fixture output', category: 'tool', weight: 1, size: [1, 1] },
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

  it('rejects placement loot without a container and retains the same loot when a pocket exists', () => {
    const source = 'test/fixtures/content/loot-override-no-container.json';
    const data = JSON.parse(readFileSync(source, 'utf8')) as ContentFile;
    const rejected = buildRegistry([{ source, data }]);
    expect
      .soft(rejected.issues)
      .toEqual([{ source, path: 'templates[0].palette["Ω"].loot', message: 'has loot but no container to put it in' }]);
    expect.soft(rejected.registry.items.has('review_only_item')).toBe(false);
    // Only the container changes: shape/references and actual marked placement stay identical.
    const control = structuredClone(data);
    control.furniture![0]!.container = { pockets: [{ grid: [1, 1], handlingSimSeconds: simSeconds(1) }] };
    const { registry, issues } = buildRegistry([{ source, data: control }]);
    expect(issues).toEqual([]);
    expect(checkReachability(registry).found.has('review_only_item')).toBe(true);
    const placement: Placement = {
      template: compileTemplate(registry, registry.templates.get('shed')!),
      origin: [0, 0, 0],
      turn: 0,
    };
    const spawned = furnitureOf({ seed: 1, registry }, placement, [0, 0]).find(
      (piece) => piece.spec.type === 'review_pedestal',
    )!;
    expect(spawned.loot.map((item) => item.type)).toEqual(['review_only_item']);
    const inventory = new Inventory(registry);
    const entity = inventory.furnish(spawned.spec, spawned.loot)!;
    expect(entity.pockets![0]!.map((placed) => placed.item.type)).toEqual(['review_only_item']);
  });

  it('registers the machete and Kabar as cutting melee tools and makes both findable', () => {
    const registry = baseRegistry;
    const machete = registry.items.get('machete')!;
    const kabar = registry.items.get('kabar')!;
    expect(machete).toMatchObject({
      name: 'Machete',
      category: 'tool',
      weight: 550,
      size: [1, 4],
      model: 'machete',
      tool: { qualities: { cutting: 2 } },
      weapon: { melee: { damage: 11, reach: 0.45, cooldownSimSeconds: 0.75, stamina: 5, impulse: 4.5, type: 'cut' } },
    });
    expect(kabar).toMatchObject({
      name: 'Kabar',
      category: 'tool',
      weight: 300,
      size: [1, 3],
      model: 'kabar',
      tool: { qualities: { cutting: 2 } },
      weapon: { melee: { damage: 9, reach: 0.3, cooldownSimSeconds: 0.55, stamina: 3.5, impulse: 4, type: 'cut' } },
    });
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

  it('reports required sound events missing from the registry', () => {
    const missingLight = requiredSoundIssues(missingSoundsRegistry).some(
      (issue) => issue.message === 'missing required sound event "player_hurt_light"',
    );
    expect(missingLight).toBe(true);
  });

  it('requires the blocked door-close sound event', () => {
    expect(requiredSoundIssues(missingSoundsRegistry).map((issue) => issue.message)).toContain(
      'missing required sound event "door_blocked_close"',
    );
  });

  it('fails when a required sound event has no definition', () => {
    const registry = { ...baseRegistry, sounds: new Map(baseRegistry.sounds) };
    registry.sounds.clear();
    registry.sounds.set('player_hurt_light', baseRegistry.sounds.get('player_hurt_light')!);
    const missingHeavy = requiredSoundIssues(registry).some(
      (issue) => issue.message === 'missing required sound event "player_hurt_heavy"',
    );
    expect(missingHeavy).toBe(true);
  });

  it('lets a later file override a block without changing its runtime id', () => {
    const mod = {
      source: 'mod.json',
      data: { blocks: [{ id: 'grass', name: 'Dead grass', color: '#8a7a40', solid: true }] },
    };
    const before = baseRegistry;
    const after = buildRegistry([...base, mod]).registry;
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
            attack: { damage: 5, reach: 1, cooldownSimSeconds: 1.5, windupSimSeconds: 0.3 },
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
            attack: { damage: 5, reach: 1, cooldownSimSeconds: 1.5, windupSimSeconds: 0.3 },
            dismember: { chance: 0.15, headOnKillChance: 0.25 },
            abilities: [],
          },
        ],
      },
    };
    expect(validateContent(missingStepLength).map((issue) => issue.path)).toContain('zombies[0].stepLength');
  });

  it('reports a duplicate id within a file', () => {
    const block = { id: 'ok', name: 'Fine', color: '#ffffff', solid: true };
    const issues = validateContent({ source: 'dup.json', data: { blocks: [block, block] } });
    expect(issues).toEqual([{ source: 'dup.json', path: 'blocks[1].id', message: 'duplicate id "ok" in this file' }]);
  });

  it('merges every descriptor section in the base pack, including recipes and skills', () => {
    const registry = baseRegistry;
    expect(registry.items.size).toBeGreaterThan(30);
    for (const section of CONTENT_SECTION_KEYS) {
      const count = section === 'blocks' ? registry.blocks.length - 1 : registry[section].size;
      expect(count, section).toBeGreaterThan(0);
    }
    expect(registry.recipes.get('torch')?.skills).toEqual({ crafting: 0 });
    expect(registry.skills.get('crafting')?.name).toBe('Crafting');
    expect(registry.figures.get('player')?.palette).toEqual({ skin: '#c58f70', shirt: '#52677d', trousers: '#4a4b55' });
  });
});

describe('content references', () => {
  it('uses the content container-width limit and requires a reason for wider pockets', () => {
    const content = {
      inventory: [{ id: 'player', containerMaxWidthCells: 4 }],
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

  it('rejects craftable content when the single crafting tier offset is missing', () => {
    const withoutOffset = base.map(({ source, data }) => {
      if (source !== 'recipes.json') {
        return { source, data };
      }
      const recipes = structuredClone(data) as { skills: { id: string; name: string; training?: unknown }[] };
      recipes.skills = recipes.skills.map(({ training, ...skill }) =>
        skill.id === 'crafting' ? skill : { ...skill, ...(training === undefined ? {} : { training }) },
      );
      return { source, data: recipes };
    });
    const { issues } = buildRegistry(withoutOffset);
    expect(
      issues.some(
        (issue) => issue.source === 'recipes.json' && issue.message.includes('missing required skill tuning'),
      ),
    ).toBe(true);
  });

  it('requires Inventory Management training to be untiered', () => {
    const baseActivity = baseRegistry.skills.get('inventory_management')?.training?.activities?.handling;
    expect(baseActivity?.practice).toBeDefined();
    expect(baseActivity?.tier).toBeUndefined();

    const tiered = base.map(({ source, data }) => {
      if (source !== 'recipes.json') {
        return { source, data };
      }
      const recipes = structuredClone(data) as {
        skills: { id: string; training?: { activities?: Record<string, { tier?: number }> } }[];
      };
      recipes.skills.find(({ id }) => id === 'inventory_management')!.training!.activities!.handling!.tier = 1;
      return { source, data: recipes };
    });
    const { issues } = buildRegistry(tiered);
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
      items: baseContent('items-other.json').items!.filter(({ id }) => id === 'bandage'),
      skills: baseContent('recipes.json').skills,
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
          models: [{ id: 'glowstick', file: 'assets/models/glowstick.glb' }],
        },
      },
    ]);

    expect(issues.some((issue) => issue.message === 'an emissive light model needs an emissive material')).toBe(true);
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
            door: { handlingSimSeconds: 0.4, openNoise: { sound: 'door_open' } },
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

  it('lets only a military table hold military-only loot, boxed at any depth, and no salvage or recipe make it', () => {
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
      military: true,
      rolls: [1, 1],
      entries: [
        { item, weight: 1 },
        { item: cartridge, weight: 1 },
      ],
    };
    const source = 'military-sources.json';
    const { issues } = buildRegistry([
      {
        source: 'military-fixture.json',
        data: {
          models: [{ ...firearmModel, id: item, attachments: [] }],
          items: [
            { id: item, name: 'Fixture rifle', category: 'weapon', weight: 1, size: [1, 1], firearm, model: item },
            { id: cartridge, name: 'Fixture cartridge', category: 'material', weight: 1, size: [1, 1], ammo },
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
              military: true,
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
            // Listed before the box it holds, so finding boxes in one pass would miss it.
            {
              id: 'fixture_ammo_case',
              name: 'Case',
              category: 'material',
              weight: 1,
              size: [1, 1],
              unpack: { item: 'fixture_box', count: 1 },
            },
            {
              id: 'fixture_box',
              name: 'Box',
              category: 'material',
              weight: 1,
              size: [1, 1],
              unpack: { item: cartridge, count: 1 },
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
      { source, path: 'loot[1].entries[0].item', message: `${only(item)}; only a "military" table may hold it` },
      { source, path: 'loot[1].entries[1].table', message: `only a "military" table may nest "${armoury.id}"` },
      {
        source,
        path: 'loot[1].entries[3].item',
        message: `${only('fixture_ammo_case')}; only a "military" table may hold it`,
      },
      { source, path: 'items[0].salvage[0].item', message: `${only(item)}; salvage may not yield it` },
      { source, path: 'items[1].disassembly.yields[0].item', message: `${only(item)}; salvage may not yield it` },
      { source, path: 'recipes[0].result.item', message: `${only('fixture_box')}; no recipe may make it` },
    ]);
  });

  it('limits military tables to military templates and forbids them on zombie types', () => {
    const source = 'military-site.json';
    const lootId = 'fixture_military_table';
    const furniture = {
      ...structuredClone(baseRegistry.furniture.get('crate')!),
      id: 'fixture_crate',
      loot: undefined,
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
    zombie.loot = lootId;
    const sounds = [...new Set(Object.values(zombie.sounds))].map((id) => baseRegistry.sounds.get(id)!);
    const { quality, level } = zombie.downed!.dismember;
    const result = buildRegistry([
      {
        source,
        data: {
          items: [
            { id: 'fixture_military_item', name: 'Fixture item', category: 'material', weight: 1, size: [1, 1] },
            {
              id: 'fixture_blade',
              name: 'Fixture blade',
              category: 'tool',
              weight: 1,
              size: [1, 1],
              tool: { qualities: { [quality]: level } },
            },
          ],
          loot: [
            { id: lootId, military: true, rolls: [1, 1], entries: [{ item: 'fixture_military_item', weight: 1 }] },
          ],
          furniture: [furniture],
          templates: [template],
          zombies: [zombie],
          sounds,
        },
      },
    ]);
    expect(result.issues).toEqual([
      {
        source,
        path: 'templates[0].palette["C"].loot',
        message: 'military loot tables may only appear in a military template',
      },
      {
        source,
        path: 'zombies[0].loot',
        message: 'zombie loot may not use a military table',
      },
    ]);
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
          { id: 'safe', name: 'Safe', size: [1, 1, 1], color: '#333333', loot: 'vault' },
          {
            id: 'pry_door',
            name: 'Pry door',
            size: [1, 1, 1],
            color: '#333333',
            door: {
              handlingSimSeconds: 0.4,
              prying: {
                quality: 1,
                skill: 'missing_skill',
                timeSimSeconds: 2,
                fastestTimeSimSeconds: 1,
                strikeIntervalSimSeconds: 1,
              },
            },
          },
        ],
        zombies: [
          {
            id: 'clerk',
            name: 'Clerk',
            model: 'shambler',
            spawnWeight: 1,
            canJumpObstacles: true,
            sounds: zombieSounds,
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.5 },
            stepLength: 0.6,
            wander: {
              obstacleWanderChance: 0.25,
              obstacleWanderDistanceMetres: 10,
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
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            hearingModel: {
              farMultiplier: 2,
              bearingErrorRadians: 0.61,
              investigationDistanceMetres: 8,
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
            attack: { damage: 5, reach: 1, cooldownSimSeconds: 1.5, windupSimSeconds: 0.3 },
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
              power: { battery: 'bandage', chargePerGameHour: 1 },
            },
          },
        ],
      },
    };
    expect(paths(buildRegistry([referenceDependencies, mod]).issues).sort()).toEqual([
      'furniture[0].loot',
      'furniture[0].loot',
      'furniture[1].door.prying.skill',
      'items[0].light.power.battery',
      'zombies[0].downed.dismember.quality',
      'zombies[0].loot',
    ]);
  });
});

const templateZombieFile = base.find(({ source }) => source === 'zombies.json')!;
const templateShambler = Object.fromEntries(
  Object.entries(
    structuredClone(
      (templateZombieFile.data as { zombies: { id: string }[] }).zombies.find(({ id }) => id === 'shambler')!,
    ),
  ).filter(([key]) => key !== 'loot'),
);
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
          { id: 'fixture_door', name: 'Door', size: [1, 1, 1], color: '#7a5534', door: { handlingSimSeconds: 0.5 } },
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

  it('gives every base block a known pattern and patterns the stone work', () => {
    const registry = baseRegistry;
    const patternOf = (id: string) => BLOCK_PATTERNS[blockPatterns(registry)[registry.blockIds.get(id)!]!];
    expect(patternOf('brick')).toBe('brick');
    expect(patternOf('stone')).toBe('rough');
    expect(patternOf('dressed_stone')).toBe('dressed');
    expect(patternOf('cobblestone_mossy')).toBe('cobble');
    expect(patternOf('hazard_yellow')).toBe('none');
  });
});
