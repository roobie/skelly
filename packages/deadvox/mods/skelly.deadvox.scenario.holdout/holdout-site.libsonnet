local waves = import 'waves.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
// A sheet is 512 m square from the origin, so its centre sits at 256 m; the bounds are centred on that sheet centre,
// and the shelter, the hub every other ask is placed from, stands there.
local bounds = { x0: -244, z0: -244, x1: 756, z1: 756 };
local shelterAt = [(bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2];
local house = import 'holdout-house.libsonnet';
local plant = import 'holdout-plant.libsonnet';
local stockpile = function(id, items) {
  id: id,
  lootContext: context,
  size: [10, 3, 10],
  palette: {
    '.': 'air',
    G: { ground: true },
    b: { furniture: 'board_stack', items: items.boards },
    s: { furniture: 'sheet_metal_stack', items: items.sheets },
    c: { furniture: 'crate', loot: 'building_materials' },
  },
  layers: [
    ['GGGGGGGGGG' for _ in std.range(1, 10)],
    [
      '..........', '.bb..sss..', '.bb..sss..', '.bb..sss..', '.bb.......',
      '..........', '.cc.......', '.cc.......', '..........', '..........',
    ],
    [
      '..........', '..........', '..........', '..........', '..........',
      '..........', '.cc.......', '.cc.......', '..........', '..........',
    ],
  ],
};
local starterStockpile = stockpile('holdout_starter_stockpile', {
  boards: [{ item: 'wooden_plank', count: 24 }],
  sheets: [{ item: 'sheet_metal', count: 12 }],
});
local boardStockpile = stockpile('holdout_board_stockpile', {
  boards: [{ item: 'wooden_plank', count: 32 }],
  sheets: [{ item: 'sheet_metal_small', count: 20 }],
});
local sheetStockpile = stockpile('holdout_sheet_stockpile', {
  boards: [{ item: 'wooden_plank', count: 20 }],
  sheets: [{ item: 'sheet_metal', count: 20 }],
});
{
  waveDay: 24 * 3,
  debugWaveDay: 0.1,
  shelter: house,
  stockpiles: [starterStockpile, boardStockpile, sheetStockpile],
  plant: plant,
  scenario(afterGameHours):: {
    id: 'holdout',
    kind: 'composedSite',
    outbreakAgeGameHours: 24 * 120,
    decalLimit: 48,
    body: 'player',
    compression: 'player',
    bounds: bounds,
    ground: 21,
    lootContext: context,
    settlementKind: 'rural',
    woodlands: [
      { polygon: [[-480, -450], [-80, -440], [40, -220], [-90, 80], [-440, 180]], profile: 'woodland' },
      { polygon: [[160, -360], [470, -420], [480, 320], [240, 400], [100, 120]], profile: 'woodland' },
      { polygon: [[-340, -260], [-40, -260], [-40, -40], [-340, -40]], profile: 'meadow' },
      { polygon: [[200, 40], [400, 40], [400, 220], [200, 220]], profile: 'meadow' },
    ],
    start: { ask: 'shelter' },
    placement: { apronMetres: 2, attempts: 1000 },
    asks: [
      { kind: 'place', id: 'shelter', template: house.id, at: shelterAt },
      {
        kind: 'place', id: 'starter_stockpile', template: starterStockpile.id, supplies: ['building_materials'],
        distance: { from: 'shelter', curve: [[0, 8], [80, 8], [180, 1], [260, 0]] },
      },
      {
        kind: 'place', id: 'board_stockpile', template: boardStockpile.id, supplies: ['building_materials'],
        distance: { from: 'shelter', curve: [[0, 1], [100, 3], [300, 2], [450, 0]] },
      },
      {
        kind: 'place', id: 'sheet_stockpile', template: sheetStockpile.id, supplies: ['building_materials'],
        distance: { from: 'shelter', curve: [[0, 1], [100, 3], [300, 2], [450, 0]] },
      },
      // Far enough that power is a trip, near enough that the first days can make it.
      {
        kind: 'place', id: 'power_plant', template: plant.plant.id,
        distance: { from: 'shelter', curve: [[0, 0], [60, 1], [150, 3], [250, 1], [350, 0]] },
      },
      {
        kind: 'place', id: 'plant_stores', template: plant.stores.id, supplies: ['plant_spares'],
        distance: { from: 'power_plant', curve: [[0, 0], [20, 2], [80, 2], [150, 0]] },
      },
      {
        kind: 'place', id: 'rural_plot', pool: 'rural_plots',
        distance: { from: 'shelter', curve: [[0, 1], [100, 3], [300, 2], [450, 0]] },
      },
    ],
    guarantee: { building_materials: 3, plant_spares: 1 },
    population: { authoredMarkers: false },
    anchors: [
      { id: 'north_road', kind: 'edge', minDistance: 100, clearOf: ['woodland', 'building'], spawnMarginMetres: 2, woodlandDensityFloor: 0.1 },
      { id: 'far_edge', kind: 'edge', minDistance: 250, clearOf: ['woodland', 'building'], spawnMarginMetres: 2, woodlandDensityFloor: 0.1 },
    ],
    eventRules: waves.rules(['north_road', 'far_edge'], first=afterGameHours, gap=24 * 5, count=50, escalation=[
      { actor: 'shambler', count: 8 },
      { actor: 'shambler', count: 12 },
      { actor: 'shambler', count: 16 },
    ]),
  },
  // A plant hand: enough mechanics to know the spares and fit any part the plant can fail on.
  start: kit.common + {
    id: 'holdout',
    site: 'holdout',
    skills: { mechanics: 1 },
    kit+: [
      { id: 'compass', item: 'compass', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
      // The sheet holding the start: the shelter's centre, 256 m, falls in region 0.
      { id: 'regional_map', item: 'regional_map', destination: { kind: 'pocket', parent: 'jeans', pocket: 1 }, paperMap: { x: 0, z: 0 } },
    ],
  },
}
