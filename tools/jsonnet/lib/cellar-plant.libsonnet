// A cellar's fitted corner, the program every briefed cellar keeps: the boiler and its coal bin against
// the back wall, storage shelves on the east wall, a floor drain in front of the boiler and a bare bulb
// over the floor between them, which stays clear from the room to every fitting. A building defines only
// the piece, which carries its style and loot context, while the fittings and the stores' loot table stay
// shared. Why: `packages/deadvox/docs/building-pathway.md`, "Shared pieces".
//
// Layer marks: ',' is reserved circulation, '.' owned air, and every other mark claims its cell.
local open = ',,,,,';
local shelved(back) = [open + 's', open + 's', open + 't', open + 't', back, back];
local repeat(layer, count) = [layer for _ in std.range(1, count)];
local layers = [
  [open + 's', open + 's', open + 't', ',,,g,t', 'cccBBB', 'cccBBB'],
  shelved('cccBBB'),
] + repeat(shelved('...BBB'), 2) + repeat([open + '.', open + '.', open + '.', open + '.', '...BBB', '...BBB'], 2) + [
  [open + '.', open + '.', ',,L,,.', open + '.', '......', '......'],
];
local claims = [
  [std.join('', [std.get({ ',': 'R', '.': 'A' }, mark, 'S') for mark in std.stringChars(row)]) for row in layer]
  for layer in layers
];
local stores = { furniture: 'shelf', facing: 'w', fixed: true, loot: 'cellar_storage' };
// `id` names the building's piece; `base` carries its style and loot context.
function(id, base) {
  local piece = base + {
    id: id, size: [6, 7, 6],
    palette: {
      ',': { role: 'opening', material: 'opening' },
      '.': { role: 'opening', material: 'opening' },
      B: { furniture: 'solid_fuel_boiler', fixed: true },
      c: { furniture: 'coal_bin', fixed: true },
      s: stores,
      t: stores,
      g: { furniture: 'floor_drain', fixed: true },
      L: { furniture: 'bare_bulb', fixed: true },
    },
    layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
  },
  mapPieces: [piece],
  // The corner slot at `at`, its east side on the cellar's east wall and its back on the back wall.
  slot(slotId, at): { id: slotId, at: at, size: piece.size, turn: 0, choices: [{ ref: { kind: 'piece', id: id }, weight: 1 }] },
}
