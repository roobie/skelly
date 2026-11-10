import { readFileSync } from 'node:fs';
import { buildRegistry, type ContentSource, type Registry } from '@skelly/engine/content';
import type { StartPlacementDef } from '@skelly/engine/internal/core/scenarioStart.ts';
import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import type { MapPoolDef, ScenarioDef, TemplateDef } from '@skelly/engine/internal/core/schema.ts';
import { gameHours } from '@skelly/engine/internal/core/time.ts';
import { fixtureBlockMaterial } from '../blockMaterialFixture.ts';
import {
  FIXTURE_BLOW_SOUND,
  FIXTURE_MATERIAL,
  fixtureBreach,
  fixtureEconomy,
  fixtureLootContext,
  fixtureMaterials,
  fixtureSounds,
} from '../economyFixtures.ts';
import { fixtureActorFigures } from './actorFigures.ts';
import { bodySoundIds } from './bodySounds.ts';
import { fixtureIds } from './capabilityIds.ts';
import { fixtureDamageContent } from './damageKinds.ts';
import { playerInventorySource } from './playerInventory.ts';

export const fixtureScenario = (): ScenarioDef => ({
  id: 'fixture_scenario',
  kind: 'assembledCity',
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

/** The placement of the one start a scenario's site defaults to, so a test builds the playable run that start selects. */
export const defaultStartOf = (registry: Pick<Registry, 'starts'>, scenario: ScenarioDef): StartPlacementDef => {
  const rows = [...registry.starts.values()].filter((row) => row.defaultForSite && row.site === scenario.id);
  const placement = rows.length === 1 ? rows[0]!.placement : undefined;
  if (!placement) {
    throw new Error(`Scenario "${scenario.id}" needs one default start with a placement`);
  }
  return placement;
};

export const fixtureStartRow = (
  placement: StartPlacementDef | null = fixtureStart(),
  { id = 'fixture_start_row', site = 'fixture_scenario' } = {},
): StartDef => ({
  id,
  site,
  defaultForSite: true,
  ...(placement ? { placement } : {}),
  kit: [],
  wounds: [],
  skills: {},
  recipes: [],
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

export const fixtureStart = (): StartPlacementDef => ({
  template: 'fixture_start',
  cell: [0, 0],
  spawn: [2, 7, 2],
  minimumOpenDescents: 1,
  descents: [{ kind: 'ladder', ladder: [4, 1, 3], upper: [6.5, 7, 4], lower: [3, 1, 4] }],
});

export const composedFixture = (starts: StartDef[] = []) => {
  const profile = fixtureScenario();
  profile.city.street = 8;
  const service = fixtureService();
  service.size[1] = 12;
  service.layers = service.layers.slice(0, service.size[1]);
  service.palette.C = { furniture: 'fixture_crate' };
  service.layers[1]![2] = '..C.....==';
  profile.composition = {
    fixedLoot: [
      {
        at: [2, 1, 2],
        lootUsage: ['Medical'],
        items: [
          { item: 'fixture_token', count: 3 },
          { item: 'fixture_token', placement: 'surface' },
        ],
      },
    ],
    leads: [{ template: 'fixture_note_a' }, { template: 'fixture_note_b' }],
    landmarks: ['fixture_landmark_a', 'fixture_landmark_b'],
    incidentalTemplates: ['fixture_small_house'],
    objective: [2, 1, 2],
    objectiveFace: [2, 1, 4],
    retreat: [2, 7, 2],
    resources: [{ at: [2, 1, 2], standing: [2, 1, 4] }],
    storeys: [{ id: 'lower', standing: [2, 1, 4] }],
    stairs: [],
    seals: [],
    descents: [{ ladder: [4, 1, 3], lower: [3, 1, 4], upper: [3, 7, 4] }],
  };
  const sources = fixtureScenarioSources(profile, service);
  sources.push({
    source: 'composition-fixture.json',
    data: {
      furniture: [
        {
          id: 'fixture_note',
          name: 'Fixture note',
          size: [1, 1, 1],
          color: '#ffffff',
          massKg: 1,
          solid: false,
          readable: { title: 'Fixture lead', text: 'An independent fixture lead.' },
          breach: fixtureBreach(),
          material: FIXTURE_MATERIAL,
        },
      ],
      templates: ['fixture_note_a', 'fixture_note_b', 'fixture_landmark_a', 'fixture_landmark_b'].map((id) => ({
        id,
        lootContext: fixtureLootContext(),
        size: [1, 2, 1],
        palette: { '=': 'fixture_solid', N: { furniture: 'fixture_note' } },
        layers: [['='], ['N']],
      })),
      starts,
    },
  } satisfies ContentSource);
  const built = buildRegistry(sources);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  return { profile, registry: built.registry };
};

export const fixtureScenarioSources = (
  scenario = fixtureScenario(),
  service = fixtureService(),
  pool = fixturePool(),
): ContentSource[] => {
  const {
    body: [body],
  } = JSON.parse(readFileSync('../mods/skelly.body/body.json', 'utf8'));
  const { actors } = JSON.parse(readFileSync('mods/skelly.deadvox.actors/enemies.json', 'utf8'));
  const {
    footstepSound: _footstepSound,
    loot: _loot,
    ...actorSource
  } = actors.find((entry: { capability?: string[] }) => entry.capability?.includes('settlementHorde'));
  const actor = { ...actorSource, id: 'fixture_settlement_actor' };
  actor.severedItems = Object.fromEntries(Object.keys(actor.regions).map((region) => [region, null]));
  const selectedSounds = new Set([...bodySoundIds(body), ...Object.values(actor.sounds)]);
  const bodySounds = [
    'mods/skelly.deadvox.actors/actors-sounds.json',
    '../mods/skelly.body/body-sounds.json',
    '../mods/skelly.body/body-synth-sounds.json',
  ].flatMap((file) =>
    (JSON.parse(readFileSync(file, 'utf8')).sounds as { id: string }[]).filter(({ id }) => selectedSounds.has(id)),
  );
  const {
    compression: [compression],
  } = JSON.parse(readFileSync('../mods/skelly.inventory/compression.json', 'utf8'));
  const {
    siteGeneration: [baseSite],
  } = JSON.parse(readFileSync('mods/skelly.deadvox.site-generation/site-generation.json', 'utf8'));
  return [
    {
      source: 'scenario-fixture.json',
      data: {
        damageKinds: fixtureDamageContent().damageKinds,
        actors: [actor],
        actorFigures: fixtureActorFigures(actor),
        furnitureMaterials: fixtureMaterials(),
        blockMaterials: [fixtureBlockMaterial('fixture_solid')],
        sounds: [...fixtureSounds(), ...bodySounds],
        blocks: [
          {
            id: 'fixture_solid',
            material: FIXTURE_MATERIAL,
            name: 'Fixture solid',
            solid: true,
            color: '#808080',
            drops: { default: FIXTURE_BLOW_SOUND },
          },
          {
            id: 'asphalt',
            material: FIXTURE_MATERIAL,
            name: 'Fixture asphalt',
            solid: true,
            color: '#404040',
            drops: { default: FIXTURE_BLOW_SOUND },
          },
          {
            id: 'fixture_water',
            material: FIXTURE_MATERIAL,
            name: 'Fixture water',
            solid: false,
            opaque: false,
            liquid: true,
            color: '#3b6e8f',
          },
        ],
        siteGeneration: [
          {
            id: fixtureIds.authoredSite,
            capability: 'authoredSite',
            activeActorRadiusMetres: baseSite.activeActorRadiusMetres,
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
              terrain: {
                grass: 'fixture_solid',
                dirt: 'fixture_solid',
                rock: 'fixture_solid',
                sand: 'fixture_solid',
                water: 'fixture_water',
              },
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
            id: 'fixture_dismember_tool',
            workInProgress: false,
            name: 'Fixture blade',
            category: 'tool',
            weight: 1,
            size: [1, 1],
            tool: { qualities: { [actor.downed.dismember.quality]: actor.downed.dismember.level } },
          },
          {
            id: 'fixture_token',
            workInProgress: false,
            name: 'Fixture token',
            category: 'material',
            weight: 1,
            size: [1, 1],
          },
          {
            id: 'fixture_event_token',
            workInProgress: false,
            name: 'Fixture event token',
            category: 'material',
            weight: 1,
            size: [1, 1],
          },
        ],
        itemEconomy: [
          { id: 'fixture_dismember_tool', ...fixtureEconomy(), notLoot: true },
          { id: 'fixture_token', ...fixtureEconomy(), notLoot: false },
          { id: 'fixture_event_token', usage: ['Military'], tiers: ['Tier2'], notLoot: false },
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
