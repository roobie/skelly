// The plant the holdout restores and the stores that keep its spares (`packages/deadvox/docs/holdout.md`, "Supplies
// and progression"). The lamp is fixed beside the module, so whether the module produces shows from the door.
local context = { usage: ['Industrial'], tier: 'Tier1' };
local hall(id, size, palette, floor, rooms, top, entrance) = {
  id: id,
  lootContext: context,
  size: size,
  palette: { '.': 'air', '#': 'brick', k: 'concrete', D: { furniture: 'wood_door' } } + palette,
  layers: [floor] + rooms + [top, floor],
  access: { ground: 'ground', entrance: entrance, storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
local plant = hall(
  'holdout_power_plant',
  [12, 6, 9],
  {
    T: { furniture: 'turbo_generator', facing: 's', fixed: true },
    E: { furniture: 'electric_lamp', fixed: true },
  },
  [
    '############',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '#kkkkkkkkkk#',
    '############',
  ],
  [[
    '############',
    '#..........#',
    '#.TTTT...E.#',
    '#.TTTT.....#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#####DD#####',
  ] for _ in std.range(1, 3)],
  [
    '############',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#####DD#####',
  ],
  [5, 1, 7],
);
// One of each failure's spare, what makes another and the tools that fit them, so a stores reached is a plant restored.
local spares = [
  { item: 'exciter_brush_set', condition: 1 },
  { item: 'governor_linkage', condition: 1 },
  { item: 'field_fuse', count: 2 },
];
local inputs = [
  { item: 'aa_battery', count: 2 },
  { item: 'copper_wire', count: 2 },
  { item: 'small_spring', count: 2 },
  { item: 'fastener_pack', count: 1 },
  { item: 'scrap_metal', count: 2 },
  { item: 'fuse', count: 2 },
];
local tools = [
  { item: 'screwdriver', condition: 1 },
  { item: 'adjustable_pliers', condition: 1 },
];
local storesRoom = [
  '########',
  '#SS..aa#',
  '#......#',
  '#cc....#',
  '#cc....#',
  '###DD###',
];
local storesTop = [
  '########',
  '#SS..aa#',
  '#......#',
  '#......#',
  '#......#',
  '###DD###',
];
local stores = hall(
  'holdout_plant_stores',
  [8, 6, 6],
  {
    S: { furniture: 'shelf', facing: 's', items: spares, loot: 'plant_spares' },
    a: { furniture: 'shelf', facing: 's', items: inputs + tools, loot: 'building_tools' },
    c: { furniture: 'crate', loot: 'plant_spares' },
  },
  ['########', '#kkkkkk#', '#kkkkkk#', '#kkkkkk#', '#kkkkkk#', '########'],
  [storesRoom, storesRoom, storesTop],
  storesTop,
  [4, 1, 4],
);
{ plant: plant, stores: stores }
