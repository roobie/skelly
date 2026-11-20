// The shared dirt-road kit: one road profile whose width every gate port of this profile must span, and the
// three buildings that carry it — two walled compounds with a road gate each, and the corner transition whose
// route bends the road. Marks state their claims, so the layers and ownership cannot disagree: '_' is air
// reserved for the road and the room, and every other mark is owned.
local context = { usage: ['Residential'], tier: 'Tier1' };
local style = 'dirt_roads';
local palette = {
  '_': { role: 'opening', material: 'opening' },
  w: { role: 'shell', material: 'boarding' },
  k: { role: 'support', material: 'slab' },
  p: { role: 'interior_floor', material: 'floor' },
  r: { role: 'roof', material: 'sheet' },
  q: { role: 'support', material: 'path' },
};
local claim(mark) = std.get({ _: 'R' }, mark, 'S');
local piece(id, size, layers, ports=[], route=null) = {
  id: id, size: size, style: style, lootContext: context, palette: palette, layers: layers,
  ownership: { layers: [[std.join('', std.map(claim, std.stringChars(row))) for row in layer] for layer in layers] },
  anchors: {}, ports: ports,
  [if route != null then 'route']: route,
};
local perimeter(x, z, wide, deep) = z == 0 || z == deep - 1 || x == 0 || x == wide - 1;
// A walled compound of `wide` by `deep` cells with one road gate: east face for the homestead, west for the
// barn. The gate spans `mouth` cells of that face and everything between the walls stays reserved open room.
local compoundLayers(wide, deep, faceEast, mouthLo, mouthHi) =
  local gateOpen(x, z) = if faceEast then x == wide - 1 else x == 0;
  [
    [std.join('', [if perimeter(x, z, wide, deep) then 'k' else 'p' for x in std.range(0, wide - 1)]) for z in std.range(0, deep - 1)],
  ] + [
    [
      std.join('', [
        if gateOpen(x, z) && z >= mouthLo && z <= mouthHi then '_'
        else if perimeter(x, z, wide, deep) then 'w'
        else '_',
        for x in std.range(0, wide - 1)
      ])
      for z in std.range(0, deep - 1)
    ]
    for y in std.range(1, 4)
  ] + [
    [std.join('', ['r' for x in std.range(0, wide - 1)]) for z in std.range(0, deep - 1)],
  ];
// The homestead: the start compound, gate in its east wall. The gate opening spans the port's clearance, which
// is wider than the road's aperture because a passing body needs shoulder room beside the road.
local homesteadPiece = piece('roads_homestead_piece', [16, 6, 12], compoundLayers(16, 12, true, 2, 8), [
  {
    id: 'gate', type: 'dirt_road', at: [16, 1, 5], facing: 'e', traversal: 'walk', aperture: [5, 4],
    clearance: { min: [12, 1, 2], size: [4, 4, 7] }, standing: [14, 1, 5],
  },
]);
// The barn: the far compound, gate in its west wall.
local barnPiece = piece('roads_barn_piece', [16, 6, 14], compoundLayers(16, 14, false, 3, 9), [
  {
    id: 'gate', type: 'dirt_road', at: [0, 1, 6], facing: 'w', traversal: 'walk', aperture: [5, 4],
    clearance: { min: [0, 1, 3], size: [4, 4, 7] }, standing: [2, 1, 6],
  },
]);
// The corner transition: an open dirt pad whose route enters the west gate port and leaves the north outward
// port, bending the road by a quarter turn between two mated gates.
local cornerPiece = piece(
  'roads_corner_piece',
  [8, 6, 8],
  [['qqqqqqqq' for z in std.range(0, 7)]] + [['________' for z in std.range(0, 7)] for y in std.range(1, 5)],
  [
    {
      id: 'gate', type: 'dirt_road', at: [0, 1, 5], facing: 'w', traversal: 'walk', aperture: [5, 4],
      clearance: { min: [0, 1, 2], size: [8, 4, 6] }, standing: [2, 1, 5],
    },
    {
      id: 'outward', type: 'dirt_road', at: [4, 1, 0], facing: 'n', traversal: 'walk', aperture: [5, 4],
      clearance: { min: [1, 1, 0], size: [7, 4, 4] }, standing: [4, 1, 1],
    },
  ],
  route=[[0, 1, 5], [4, 1, 5], [4, 1, 0]]
);
local only(id) = [{ ref: { kind: 'piece', id: id }, weight: 1 }];
local assembly(id, pieceId, size, ports, access=null) = {
  id: id, lootContext: context, size: size,
  slots: [{ id: 'body', at: [0, 0, 0], size: size, turn: 0, choices: only(pieceId) }],
  joins: [], anchors: {}, ports: ports,
  [if access != null then 'access']: access,
};
{
  roadProfiles: [{ id: 'dirt_road', widthMetres: 2.5, surface: 'dirt' }],
  mapStyles: [{
    id: style,
    bindings: {
      opening: { role: 'opening', block: 'air' },
      boarding: { role: 'shell', block: 'plank_wall' },
      slab: { role: 'support', block: 'concrete' },
      floor: { role: 'interior_floor', block: 'plank_floor' },
      sheet: { role: 'roof', block: 'galvanized' },
      path: { role: 'support', block: 'dirt' },
    },
  }],
  mapPieces: [homesteadPiece, barnPiece, cornerPiece],
  mapAssemblies: [
    assembly('roads_homestead', 'roads_homestead_piece', [16, 6, 12], [{ id: 'gate', slot: 'body', port: 'gate' }], {
      ground: 'ground', entrance: [14, 1, 5], storeys: [{ id: 'ground', floor: 1 }], stairs: [],
    }),
    assembly('roads_barn', 'roads_barn_piece', [16, 6, 14], [{ id: 'gate', slot: 'body', port: 'gate' }]),
    assembly('roads_corner', 'roads_corner_piece', [8, 6, 8], [
      { id: 'gate', slot: 'body', port: 'gate' },
      { id: 'outward', slot: 'body', port: 'outward' },
    ]),
  ],
}
