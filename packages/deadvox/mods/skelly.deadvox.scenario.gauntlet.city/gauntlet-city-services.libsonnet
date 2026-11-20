// The townhouse's fixed rooms: the kitchen and bathroom in the back east corner of the storey a
// body enters by, and the cellar's fitted corner below them, which the room scenes leave free
// (`gauntlet-city-scenes.libsonnet`, `backCorner`). Why they are their own slots:
// `packages/deadvox/docs/building-pathway.md`, "Worked example: city townhouse".
//
// Layer marks: ',' is reserved circulation, '.' owned air, '-' a hole that a slot fills, and every
// other mark claims its cell; `claims` reads ownership from the marks so a layer and its claims
// cannot disagree.
local rows = import 'tools/jsonnet/lib/loot-rows.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  ',': { role: 'opening', material: 'opening' },
  '-': { role: 'opening', material: 'opening' },
  i: { role: 'interior_wall', material: 'partition' },
};
local claims(layers) = [
  [std.join('', [std.get({ '-': '.', ',': 'R', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
];
local piece(id, size, layers, extra={}) = {
  id: id, size: size, style: 'brick_townhouse', lootContext: context,
  palette: palette + extra, layers: layers, ownership: { layers: claims(layers) },
  anchors: {}, ports: [],
};
local slot(id, at, size, choices) = { id: id, at: at, size: size, turn: 0, choices: choices };
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local repeat(layer, count) = [layer for _ in std.range(1, count)];

// The kitchen opens onto the room: the sink on the east wall, the cooker against the bathroom's
// partition, the floor between them kept clear to the bathroom door.
local kitchenFloor = [',,,,,s', 'oo,,,s'];
local kitchenAir = [',,,,,.', '..,,,.'];
local kitchen = piece('gauntlet_city_kitchen', [6, 7, 2], repeat(kitchenFloor, 2) + repeat(kitchenAir, 5), {
  s: { furniture: 'kitchen_sink', facing: 'w', fixed: true },
  o: { furniture: 'cooker', fixed: true },
});

// The bathroom behind the kitchen: the toilet in the back corner, the washbasin under its cabinet on
// the back wall, the doorway in the partition to the kitchen.
local bathroomLayers = repeat(['ii--ii', 'i,,,,,', 'i,,,TT', 'i,bbTT'], 2) + [
  ['ii--ii', 'i,,,,,', 'i,,,..', 'i,....'],
  ['ii--ii', 'i,,,,,', 'i,,,..', 'i,C...'],
] + repeat(['iiiiii', 'i,,,,,', 'i,,,..', 'i,....'], 3);
local bathroomThings(cabinetLoot) = {
  T: { furniture: 'toilet', fixed: true },
  b: { furniture: 'washbasin', fixed: true },
  C: { furniture: 'bathroom_cabinet', loot: cabinetLoot },
};
local bathrooms = [
  piece('gauntlet_city_bathroom_kept', [6, 7, 4], bathroomLayers, bathroomThings('bathroom_cabinet')),
  piece('gauntlet_city_bathroom_searched', [6, 7, 4], bathroomLayers, bathroomThings('gauntlet_searched')),
];

// The bathroom door: a flimsy leaf facing the kitchen, or the leaf gone and the doorway open.
local doors = [
  piece('gauntlet_city_bathroom_door', [2, 4, 1], repeat(['DD'], 4), { D: { furniture: 'flimsy_wood_door' } }),
  piece('gauntlet_city_bathroom_doorway', [2, 4, 1], repeat(['..'], 4)) + { aftermath: ['broken'] },
];
// The cellar's back east corner, under the kitchen: the boiler and its coal bin against the back
// wall, storage shelves on the east wall, a floor drain in front of the boiler and a bare bulb over
// the floor between them, which stays clear from the room to every fitting.
local open = ',,,,,';
local shelved(back) = [open + 's', open + 's', open + 't', open + 't', back, back];
local cellarLayers = [
  [open + 's', open + 's', open + 't', ',,,g,t', 'cccBBB', 'cccBBB'],
  shelved('cccBBB'),
] + repeat(shelved('...BBB'), 2) + repeat([open + '.', open + '.', open + '.', open + '.', '...BBB', '...BBB'], 2) + [
  [open + '.', open + '.', ',,L,,.', open + '.', '......', '......'],
];
local cellar = piece('gauntlet_city_cellar_plant', [6, 7, 6], cellarLayers, {
  B: { furniture: 'solid_fuel_boiler', fixed: true },
  c: { furniture: 'coal_bin', fixed: true },
  s: { furniture: 'shelf', facing: 'w', fixed: true, loot: 'gauntlet_cellar_storage' },
  t: { furniture: 'shelf', facing: 'w', fixed: true, loot: 'gauntlet_cellar_storage' },
  g: { furniture: 'floor_drain', fixed: true },
  L: { furniture: 'bare_bulb', fixed: true },
});
{
  mapPieces: [kitchen] + bathrooms + doors + [cellar],
  // The cellar's fitted corner on the cellar storey whose floor is at `floor`; the rest of the
  // cellar stays a room slot, so a later variant can furnish it differently.
  cellarSlots(floor): [slot('cellar_plant', [9, floor, 9], cellar.size, only(cellar.id))],
  // What a house keeps on its cellar shelves: food put by, and odds and ends for the house.
  loot: [{
    id: 'gauntlet_cellar_storage', rolls: [1, 3],
    entries: [
      rows.item('canned_beans', 3, count=[1, 2]), rows.item('canned_soup', 3, count=[1, 2]),
      rows.item('water_bottle', 2), rows.item('matches', 1), rows.item('wax', 1), rows.item('rag', 2, count=[1, 3]),
      rows.item('nails', 2, count=[5, 20]), rows.item('duct_tape', 1), rows.item('aa_battery', 1, count=[1, 2]),
      rows.nothing(4),
    ],
  }],
  // The service slots of the storey whose floor is at `floor`.
  slots(floor): [
    slot('kitchen', [9, floor, 9], kitchen.size, only(kitchen.id)),
    slot('bathroom', [9, floor, 11], [6, 7, 4], [{ ref: { kind: 'piece', id: p.id }, weight: 1 } for p in bathrooms]),
    slot('bathroom_door', [11, floor, 11], [2, 4, 1], [
      { ref: { kind: 'piece', id: doors[0].id }, weight: 4 },
      { ref: { kind: 'piece', id: doors[1].id }, weight: 1 },
    ]) + { doorway: true },
  ],
  // Where the brief's rooms stand on that storey: the room off the street door, the kitchen floor
  // and the bathroom floor.
  anchors(floor): {
    living_room: { kind: 'standing', at: [4, floor, 8] },
    kitchen: { kind: 'standing', at: [12, floor, 9] },
    bathroom: { kind: 'standing', at: [12, floor, 13] },
  },
}
