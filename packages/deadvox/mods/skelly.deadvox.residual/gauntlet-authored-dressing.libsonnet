local context = { usage: [], tier: 'Tier1' };
{
  furniture: [],
  panel: {
    id: 'authored_fallen_fence_panel', size: [4, 2, 3], lootContext: context,
    palette: { '.': { ground: true }, F: { furniture: 'gauntlet_yard_fence', tip: 'back' } },
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
