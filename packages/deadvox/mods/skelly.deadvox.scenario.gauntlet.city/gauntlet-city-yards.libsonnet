local context = { usage: [], tier: 'Tier1' };
local air = ['..................', '..................'];
local circulation = ['AAAAARRRRRRAAAAAAA', 'AAAAARRRRRRAAAAAAA'];
local shrubs = ['.BBB........BBB...', '.BBB........BBB...'];
local shrubClaims = ['ASSSARRRRRRASSSAAA', 'ASSSARRRRRRASSSAAA'];
local tarped = ['............ttt...', '............ttt...'];
local tarpClaims = ['AAAAARRRRRRASSSAAA', 'AAAAARRRRRRASSSAAA'];
local fenced =['.BBB........FFFF..', '.BBB........iiii..'];
local fencedUpper = ['............FFFF..', '..................'];
local fenceClaims = ['ASSSARRRRRRASSSSAA', 'ASSSARRRRRRASSSSAA'];
local grownLow = ['GGGSS......wGSSGGG', 'GGwSS......GwSSGwG'];
local grownLowClaims = ['SSSSSRRRRRRSSSSSSS', 'SSSSSRRRRRRSSSSSSS'];
local grownTall = ['...SS........SS...', '...SS........SS...'];
local grownTallClaims = ['AAASSRRRRRRAASSAAA', 'AAASSRRRRRRAASSAAA'];
local upperClaims = ['AAAAARRRRRRASSSSAA', 'AAAAARRRRRRAAAAAAA'];
// A yard turned east to west, so its path leads to a street door east of the middle.
local mirror(rows) = [std.join('', std.reverse(std.stringChars(row))) for row in rows];
local mirrored(piece) = piece + {
  id: piece.id + '_mirrored',
  layers: std.map(mirror, piece.layers),
  ownership: { layers: std.map(mirror, piece.ownership.layers) },
};
local yard = {
  id: 'gauntlet_yard_open', size: [18, 4, 2], style: 'brick_townhouse', lootContext: context,
  palette: { '.': { role: 'opening', material: 'opening' } },
  layers: [air, air, air, air], ownership: { layers: [circulation, circulation, circulation, circulation] },
  anchors: {}, ports: [],
};
local yards = [
  { weight: 1, piece: yard },
  {
    weight: 3,
    piece: yard + {
      id: 'gauntlet_yard_shrubs', palette: yard.palette + { B: { furniture: 'gauntlet_yard_shrub' } },
      layers: [shrubs, shrubs, air, air],
      ownership: { layers: [shrubClaims, shrubClaims, circulation, circulation] },
    },
  },
  {
    weight: 1,
    piece: yard + {
      id: 'gauntlet_yard_tarp', palette: yard.palette + { t: { furniture: 'tarp' } },
      layers: [tarped, air, air, air],
      ownership: { layers: [tarpClaims, circulation, circulation, circulation] },
    },
  },
  {
    weight: 2,
    piece: yard + {
      id: 'gauntlet_yard_fenced', palette: yard.palette + {
        B: { furniture: 'gauntlet_yard_shrub' }, F: { furniture: 'gauntlet_yard_fence' }, i: { furniture: 'creeper_strip' },
      },
      layers: [fenced, fenced, fencedUpper, air],
      ownership: { layers: [fenceClaims, fenceClaims, upperClaims, circulation] },
    },
  },
  {
    weight: 2,
    piece: yard + {
      id: 'gauntlet_yard_overgrown', aftermath: ['dilapidated'], palette: yard.palette + {
        G: { role: 'trim', material: 'tall_grass' }, S: { furniture: 'shrub_tall' }, w: { furniture: 'weed_tuft' },
      },
      layers: [grownLow, grownTall, grownTall, air],
      ownership: { layers: [grownLowClaims, grownTallClaims, grownTallClaims, circulation] },
    },
  },
];
local slot(pieces) = {
  id: 'yard', at: [0, 1, 0], size: [18, 4, 2], turn: 0,
  choices: [{ ref: { kind: 'piece', id: entry.piece.id }, weight: entry.weight } for entry in pieces],
};
local turned = [entry + { piece: mirrored(entry.piece) } for entry in yards];
{
  furniture: [
    {
      id: 'gauntlet_yard_shrub', name: 'Shrub', size: [3, 2, 2], color: '#526a38', solid: false,
      shape: [
        { position: [1.3, 0, 0.8], size: [0.3, 1, 0.3] },
        { position: [0.3, 0.5, 0.2], size: [2.4, 0.9, 1.6] },
        { position: [0, 0.7, 0.5], size: [1.5, 0.8, 1.2] },
        { position: [1.1, 1.2, 0.4], size: [1.5, 0.8, 1.2] },
      ],
    },
    {
      id: 'gauntlet_yard_fence', name: 'Wooden fence', size: [4, 3, 1], color: '#74664d',
      shape: [
        { position: [0, 0, 0.3], size: [0.4, 3, 0.4] },
        { position: [3.6, 0, 0.3], size: [0.4, 3, 0.4] },
        { position: [0.4, 0.7, 0.35], size: [3.2, 0.4, 0.3] },
        { position: [0.4, 2, 0.35], size: [3.2, 0.4, 0.3] },
      ],
    },
  ],
  mapPieces: [entry.piece for entry in yards + turned],
  slot: slot(yards),
  mirroredSlot: slot(turned),
}
