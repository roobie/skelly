// The Holdout site, one content entry later rounds extend (`SLICE-5.md`, "Lanes and the next rounds").
// An existing site's buildings are not useful for the base-building loop, so the site starts as flat,
// empty ground and grows by deliberate additions in later rounds. The city scenario shape is the only
// site shape whose event rules carry with no engine code, and it requires one service building with a
// hatch portal; `service` is the smallest one those portal checks accept, so the plain stays empty.
local wave = import 'holding-wave.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
// A flush grass cap over a dug dirt cellar, with the hatch above a ladder column; layers from the bottom up.
local cellarFloor = [
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
  'dddddddddd',
];
local shaft = [
  'dddddddddd',
  'd......ddd',
  'd......ddd',
  'd...H..ddd',
  'd...H..ddd',
  'd......ddd',
  'd......ddd',
  'dddddddddd',
];
local cap = [
  'gggggggggg',
  'gggggggggg',
  'gggggggggg',
  'gggTTTgggg',
  'gggTTTgggg',
  'gggggggggg',
  'gggggggggg',
  'gggggggggg',
];
local open = [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
];
// The wave's arrival point, in world blocks: on the plain, 100 m north of the start's street crossing.
// Its height rides the site floor the pinned demo seed builds, like the playtest site's authored ground.
local arrival = [2, 47, 202];
{
  arrival: arrival,
  // Three elapsed scenario days: `SLICE-5.md`, "Settled event and playtest rules".
  waveDay: 24 * 3,
  // Six game minutes, so a debug look waits under a minute of real time for the wave to fire.
  debugWaveDay: 0.1,
  service: {
    id: 'holdout_service',
    lootContext: context,
    size: [10, 12, 8],
    palette: {
      '.': 'air',
      d: 'dirt',
      g: 'grass',
      H: { furniture: 'ladder', facing: 'w' },
      T: { furniture: 'roof_hatch', facing: 'w' },
    },
    layers: [cellarFloor] + [shaft, shaft, shaft, shaft, shaft] + [cap] + [open, open, open, open, open],
    access: { ground: 'ground', entrance: [2, 7, 2], storeys: [{ id: 'ground', floor: 7 }], stairs: [] },
  },
  scenario(afterGameHours):: {
    id: 'holdout',
    kind: 'assembledCity',
    outbreakAgeGameHours: 24 * 120,
    decalLimit: 48,
    body: 'player',
    compression: 'player',
    serviceTemplate: 'holdout_service',
    portal: { hatch: [3, 6, 3], ladder: [4, 1, 3], upper: [6.5, 7, 4], lower: [3, 1, 4] },
    // No composition: no objective ends the run, so waves never stop, and starts on it take no placement.
    population: {
      settlementPressure: false,
      authoredMarkers: false,
      groupSize: 1,
      hordes: 0,
      roadsideOffset: 1,
      extraStragglers: 0,
    },
    city: {
      settlementKind: 'city',
      blocksX: 1,
      blocksZ: 1,
      street: 4,
      blockX: 16,
      blockZ: 16,
      pad: 2,
      gap: 1,
      blend: 1,
      rows: 2,
      // No lots, ring, props, perimeter or underground and no paved streets: the empty list of placed parts
      // later rounds grow from is `lots`, and everything but the service cell stays unauthored.
      flatSurroundings: true,
      fillRows: false,
      paving: [],
      pool: 'gauntlet_city',
      service: { cell: [0, 0], turn: 0 },
    },
    eventRules: [wave.rule(arrival, afterGameHours)],
  },
  start: kit.common + { id: 'holdout', site: 'holdout' },
}
