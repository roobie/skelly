local waves = import 'waves.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
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
    bounds: { x0: -500, z0: -500, x1: 500, z1: 500 },
    ground: 21,
    lootContext: context,
    settlementKind: 'rural',
    start: { ask: 'shelter' },
    placement: { apronMetres: 2, attempts: 1000 },
    asks: [
      { kind: 'place', id: 'shelter', template: house.id },
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
        kind: 'place', id: 'flat_roof_house', template: 'rural_flat_roof_house',
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
  start: kit.common + { id: 'holdout', site: 'holdout', skills: { mechanics: 1 } },
}
