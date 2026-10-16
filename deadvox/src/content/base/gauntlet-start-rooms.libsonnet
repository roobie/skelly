local context = { usage: ['Residential'], tier: 'Tier1' };
local palette = {
  '.': { role: 'opening', material: 'opening' },
  '#': { role: 'shell', material: 'facade' },
  D: { furniture: 'desk' },
  S: { furniture: 'shelf' },
  T: { furniture: 'workbench' },
  C: { furniture: 'crate' },
  B: { furniture: 'bed', facing: 'w' },
  W: { furniture: 'wardrobe' },
  K: { furniture: 'kitchen_cupboard' },
  F: { furniture: 'fridge' },
  V: { furniture: 'sofa' },
};
local clear = ['..............', '..............', '..............'];
local reserved = ['RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR'];
local shelfOnly = ['..............', '..............', '............SS'];
local rightTallClaims = ['RRRRRRRRRRRRRR', 'RRRRRRRRRRRRRR', 'RRRRRRRRRRRRSS'];
local desk = ['DDD...........', 'DDD...........', '............SS'];
local deskClaims = ['SSSRRRRRRRRRRR', 'SSSRRRRRRRRRRR', 'RRRRRRRRRRRRSS'];
local workshop = ['TTT...........', 'TTT.........CC', '............CC'];
local workshopClaims = ['SSSRRRRRRRRRRR', 'SSSRRRRRRRRRSS', 'RRRRRRRRRRRRSS'];
local sleeping = ['BBBB..........', 'BBBB..........', '............WW'];
local sleepingClaims = ['SSSSRRRRRRRRRR', 'SSSSRRRRRRRRRR', 'RRRRRRRRRRRRSS'];
local wardrobeOnly = ['..............', '..............', '............WW'];
local kitchen = ['..............', '............FF', 'KK..........FF'];
local kitchenClaims = ['RRRRRRRRRRRRRR', 'RRRRRRRRRRRRSS', 'SSRRRRRRRRRRSS'];
local fridgeOnly = ['..............', '............FF', '............FF'];
local fridgeClaims = ['RRRRRRRRRRRRRR', 'RRRRRRRRRRRRSS', 'RRRRRRRRRRRRSS'];
local lounge = ['VVVV..........', 'VVVV..........', '............SS'];
local loungeClaims = ['SSSSRRRRRRRRRR', 'SSSSRRRRRRRRRR', 'RRRRRRRRRRRRSS'];
local doorway = ['##########...#'];
local doorwayClaims = ['SSSSSSSSSSRRRS'];
local lintel = ['##############'];
local lintelClaims = ['SSSSSSSSSSSSSS'];
local room = function(id, layers, claims) {
  id: 'gauntlet_start_room_' + id, size: [14, 7, 3], style: 'brick_townhouse',
  lootContext: context, palette: palette, layers: layers, ownership: { layers: claims },
  anchors: {}, ports: [],
};
{
  byFloor: { '1': 'office', '9': 'workshop', '17': 'sleeping', '25': 'kitchen', '33': 'lounge' },
  mapPieces: [
    room('office',
      [desk, desk, shelfOnly, shelfOnly, clear, clear, clear],
      [deskClaims, deskClaims, rightTallClaims, rightTallClaims, reserved, reserved, reserved]),
    room('workshop',
      [workshop, workshop, clear, clear, clear, clear, clear],
      [workshopClaims, workshopClaims, reserved, reserved, reserved, reserved, reserved]),
    room('sleeping',
      [sleeping, wardrobeOnly, wardrobeOnly, wardrobeOnly, clear, clear, clear],
      [sleepingClaims, rightTallClaims, rightTallClaims, rightTallClaims, reserved, reserved, reserved]),
    room('kitchen',
      [kitchen, kitchen, fridgeOnly, fridgeOnly, clear, clear, clear],
      [kitchenClaims, kitchenClaims, fridgeClaims, fridgeClaims, reserved, reserved, reserved]),
    room('lounge',
      [lounge, lounge, shelfOnly, shelfOnly, clear, clear, clear],
      [loungeClaims, loungeClaims, rightTallClaims, rightTallClaims, reserved, reserved, reserved]),
    {
      id: 'gauntlet_start_room_partition', size: [14, 7, 1], style: 'brick_townhouse',
      lootContext: context, palette: palette,
      layers: [doorway, doorway, doorway, doorway, lintel, lintel, lintel],
      ownership: { layers: [doorwayClaims, doorwayClaims, doorwayClaims, doorwayClaims, lintelClaims, lintelClaims, lintelClaims] },
      anchors: {}, ports: [],
    },
  ],
}
