// The plant the holdout restores and the stores that keep its spares (`packages/deadvox/docs/holdout.md`, "Supplies
// and progression"). The lamp is fixed beside the module, so whether the module produces shows from the door.
local context = { usage: ['Industrial'], tier: 'Tier1' };
local hall(id, size, palette, floor, rooms, top, entrance) = {
  id: id,
  lootContext: context,
  size: size,
  palette: { '.': 'air', '#': 'brick', J: 'steel_joist', k: 'concrete', D: { furniture: 'wood_door' } } + palette,
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
    '#.TTTT#..E.#',
    '#.TTTT.....#',
    '#..........#',
    '#..........#',
    '#.....#....#',
    '#..........#',
    '#####DD#####',
  ] for _ in std.range(1, 3)],
  [
    '############',
    '#..........#',
    '#JJJJJJJJJJ#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#JJJJJJJJJJ#',
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
// The plant's stores are the shared works stores, racked with the plant's own supplies: the spares on one shelf, the
// inputs and tools on the other, a crate of spares beside the aisle.
local works = import '../skelly.deadvox.buildings/works-stores.libsonnet';
local stocked = {
  S: { furniture: 'shelf', facing: 'n', items: spares, loot: 'plant_spares' },
  a: { furniture: 'shelf', facing: 'n', items: inputs + tools, loot: 'building_tools' },
  c: { furniture: 'crate', loot: 'plant_spares' },
};
local rackingFloor = [
  '....__....',
  '....__....',
  '..cc__....',
  '..cc__....',
  '....__....',
  '.________.',
  '.________.',
  '.SS....aa.',
];
local rackingTop = [
  '....__....',
  '....__....',
  '....__....',
  '....__....',
  '....__....',
  '.________.',
  '.________.',
  '.SS....aa.',
];
local racking = works.racking('holdout_plant_stores_racking', [rackingFloor, rackingFloor, rackingTop, rackingTop], stocked);
{
  plant: plant,
  hall: hall,
  supplies: { spares: spares, inputs: inputs, tools: tools, stocked: stocked },
  storesRacking: racking,
  stores: works.answer('holdout_plant_stores', racking.id),
}
