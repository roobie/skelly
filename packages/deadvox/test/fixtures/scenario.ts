import { readFileSync } from 'node:fs';
import type { ContentSource } from '../../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../../src/core/contentIds.ts';
import type { MapPoolDef, ScenarioDef, TemplateDef } from '../../src/core/schema.ts';
import { gameHours } from '../../src/core/time.ts';
import {
  FIXTURE_MATERIAL,
  fixtureBreach,
  fixtureEconomy,
  fixtureLootContext,
  fixtureMaterials,
  fixtureSounds,
} from '../economyFixtures.ts';
import { playerInventorySource } from './playerInventory.ts';

export const fixtureScenario = (): ScenarioDef => ({
  id: 'fixture_scenario',
  kind: 'gauntlet',
  outbreakAgeGameHours: gameHours(24),
  decalLimit: 16,
  body: 'fixture_body',
  compression: 'fixture_compression',
  serviceTemplate: 'fixture_service',
  portal: { hatch: [3, 6, 3], ladder: [4, 1, 3], upper: [6.5, 7, 4], lower: [3, 1, 4] },
  eventRules: [],
  population: {
    settlementPressure: true,
    authoredMarkers: true,
    groupSize: 2,
    hordes: 1,
    roadsideOffset: 1,
    extraStragglers: 0,
  },
  city: {
    settlementKind: 'fixture_city',
    blocksX: 1,
    blocksZ: 1,
    street: 4,
    blockX: 20,
    blockZ: 20,
    pad: 2,
    gap: 2,
    blend: 4,
    rows: 2,
    pool: 'fixture_pool',
  },
});

export const fixturePool = (
  choices: MapPoolDef['choices'] = [{ ref: { kind: 'template', id: 'fixture_house' }, weight: 1 }],
): MapPoolDef => ({ id: 'fixture_pool', choices });

const serviceCell = (x: number, y: number, z: number): string => {
  if (y === 0) {
    return '=';
  }
  if (y === 6) {
    return x >= 3 && x <= 5 && z >= 3 && z <= 4 ? 'T' : '=';
  }
  if (y >= 6) {
    return '.';
  }
  if (x === 4 && z >= 3 && z <= 4) {
    return 'H';
  }
  return x > 0 && x < 7 && z > 0 && z < 7 ? '.' : '=';
};

export const fixtureService = (): TemplateDef => ({
  id: 'fixture_service',
  lootContext: fixtureLootContext(),
  size: [10, 40, 8],
  palette: {
    '.': 'air',
    '=': 'fixture_solid',
    H: { furniture: 'fixture_ladder', facing: 'w' },
    T: { furniture: 'fixture_hatch', facing: 'w' },
  },
  layers: Array.from({ length: 40 }, (_layerValue, layer) =>
    Array.from({ length: 8 }, (_rowValue, row) =>
      Array.from({ length: 10 }, (_columnValue, column) => serviceCell(column, layer, row)).join(''),
    ),
  ),
  access: { ground: 'ground', entrance: [2, 7, 2], storeys: [{ id: 'ground', floor: 7 }], stairs: [] },
});

const fixtureStartTemplate = (): TemplateDef => {
  const template = fixtureService();
  template.id = 'fixture_start';
  template.size = [10, 13, 8];
  template.layers = template.layers.slice(0, 13);
  for (const layer of template.layers.slice(1, 5)) {
    layer[0] = '==..======';
  }
  template.access = { ground: 'ground', entrance: [2, 1, 2], storeys: [{ id: 'ground', floor: 1 }], stairs: [] };
  return template;
};

export const fixtureStart = (): NonNullable<ScenarioDef['composition']>['start'] => ({
  template: 'fixture_start',
  cell: [0, 0],
  spawn: [2, 7, 2],
  minimumOpenDescents: 1,
  descents: [{ kind: 'ladder', ladder: [4, 1, 3], upper: [6.5, 7, 4], lower: [3, 1, 4] }],
});

export const fixtureScenarioSources = (
  scenario = fixtureScenario(),
  service = fixtureService(),
  pool = fixturePool(),
): ContentSource[] => {
  const {
    body: [body],
  } = JSON.parse(readFileSync('src/content/base/body.json', 'utf8'));
  // The base body's heartbeat names base sound events, so they come along with it.
  const heartbeatSounds = new Set(Object.values(body.heartbeat.sounds));
  const bodySounds = (
    JSON.parse(readFileSync('src/content/base/sounds.json', 'utf8')).sounds as { id: string }[]
  ).filter(({ id }) => heartbeatSounds.has(id));
  const {
    compression: [compression],
  } = JSON.parse(readFileSync('src/content/base/compression.json', 'utf8'));
  const {
    siteGeneration: [baseSite],
  } = JSON.parse(readFileSync('src/content/base/site-generation.json', 'utf8'));
  return [
    {
      source: 'scenario-fixture.json',
      data: {
        furnitureMaterials: fixtureMaterials(),
        sounds: [...fixtureSounds(), ...bodySounds],
        blocks: [
          { id: 'fixture_solid', name: 'Fixture solid', solid: true, color: '#808080' },
          { id: 'asphalt', name: 'Fixture asphalt', solid: true, color: '#404040' },
        ],
        siteGeneration: [
          {
            id: CORE_CONTENT_IDS.authoredSite,
            topography: {
              amplitudeMetres: 0,
              wavelengthMetres: 1,
              buildingMarginMetres: 0,
              roadShoulderMetres: 0,
              spawnMarginMetres: 0,
            },
            terrain: baseSite.terrain,
            vegetation: {
              ...baseSite.vegetation,
              woodlandEdgeWavelengthMetres: 1,
              woodlandEdgeVariation: 0,
              openDensity: 0,
              obstacleMarginMetres: 0,
              treeMix: ['broadleaf'],
            },
            palette: {
              terrain: { grass: 'fixture_solid', dirt: 'fixture_solid', rock: 'fixture_solid', sand: 'fixture_solid' },
              paving: 'asphalt',
              trees: { trunk: 'fixture_solid', branch: 'fixture_solid', leaves: 'fixture_solid' },
              leafLitter: 'fixture_solid',
            },
          },
        ],
        furniture: [
          {
            id: 'fixture_ladder',
            name: 'Fixture ladder',
            size: [2, 1, 1],
            color: '#808080',
            solid: false,
            climbable: { speedMetresPerSimSecond: 1.5 },
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
          },
          {
            id: 'fixture_hatch',
            name: 'Fixture hatch',
            size: [2, 1, 3],
            color: '#808080',
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
            door: {
              methods: {},
              handlingSimSeconds: 0.2,
              hatch: true,
            },
          },
          {
            id: 'fixture_crate',
            scenarioGoal: true,
            name: 'Fixture crate',
            size: [1, 1, 1],
            color: '#808080',
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
            container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 1 }] },
          },
        ],
        items: [
          {
            id: 'fixture_token',
            name: 'Fixture token',
            category: 'material',
            weight: 1,
            size: [1, 1],
            economy: fixtureEconomy(),
          },
          {
            id: 'fixture_event_token',
            name: 'Fixture event token',
            category: 'material',
            weight: 1,
            size: [1, 1],
            economy: { usage: ['Military'], tiers: ['Tier2'] },
          },
        ],
        loot: [{ id: 'fixture_loot', rolls: [1, 2], entries: [{ weight: 1, item: 'fixture_token' }] }],
        templates: [
          service,
          fixtureStartTemplate(),
          {
            id: 'fixture_small_house',
            eligibility: { settlementKinds: ['fixture_city'] },
            lootContext: fixtureLootContext(),
            size: [3, 3, 4],
            palette: { '=': 'fixture_solid' },
            layers: Array.from({ length: 3 }, (_layerValue) => Array.from({ length: 4 }, () => '===')),
          },
          {
            id: 'fixture_house',
            eligibility: { settlementKinds: ['fixture_city'] },
            lootContext: fixtureLootContext(),
            size: [4, 3, 4],
            palette: { '=': 'fixture_solid', C: { furniture: 'fixture_crate', loot: 'fixture_loot' } },
            layers: Array.from({ length: 3 }, (_layerValue, layer) =>
              Array.from({ length: 4 }, (_rowValue, row) => (layer === 1 && row === 1 ? '=C==' : '====')),
            ),
          },
        ],
        body: [{ ...body, id: scenario.body, fatigueRisePerGameHour: body.fatigueRisePerGameHour + 1 }],
        compression: [
          { ...compression, id: scenario.compression, caps: { ...compression.caps, wait: compression.caps.wait + 1 } },
        ],
        mapPools: [pool],
        scenarios: [{ ...scenario, outbreakAgeGameHours: scenario.outbreakAgeGameHours / gameHours(1) }],
      },
    },
    playerInventorySource(),
  ];
};
