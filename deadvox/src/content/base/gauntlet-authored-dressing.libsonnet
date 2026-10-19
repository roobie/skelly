local fence = std.filter(function(f) f.id == 'gauntlet_yard_fence', (import 'gauntlet-city-yards.libsonnet').furniture)[0];
local metal = std.filter(function(b) b.id == 'chain_link', (import 'blocks.jsonnet').blocks)[0].color;
local context = { usage: [], tier: 'Tier1' };
local face = std.foldl(function(depth, box) std.min(depth, box.position[2]), fence.shape, fence.size[2]);
{
  furniture: [fence + {
    id: 'gauntlet_fallen_fence_panel', name: 'Fallen fence panel', color: metal, size: [4, 1, 3],
    shape: [{ position: [box.position[0], std.round((box.position[2] - face) * 1e6) / 1e6, box.position[1]], size: [box.size[0], box.size[2], box.size[1]] } for box in fence.shape],
  }],
  panel: {
    id: 'authored_fallen_fence_panel', size: [4, 2, 3], lootContext: context,
    palette: { '.': { ground: true }, F: { furniture: 'gauntlet_fallen_fence_panel' } },
    layers: [['....', '....', '....'], ['FFFF', 'FFFF', 'FFFF']],
  },
  rubble: {
    id: 'authored_wall_rubble', size: [3, 3, 3], lootContext: context,
    palette: { g: { ground: true }, R: 'concrete', '.': 'air' },
    layers: [
      ['ggg', 'ggg', 'ggg'],
      ['.RR', 'RRR', 'R..'],
      ['..R', '...', '...'],
    ],
  },
}
