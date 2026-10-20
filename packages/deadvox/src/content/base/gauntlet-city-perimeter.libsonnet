local palette = {
  '.': 'air', J: 'concrete', H: 'hazard_yellow', C: 'chain_link',
};
local loot = { usage: [], tier: 'Tier1' };
{
  templates: [
    {
      id: 'gauntlet_perimeter_lining', size: [8, 4, 3], lootContext: loot,
      palette: palette + { F: { furniture: 'gauntlet_perimeter_notice' } },
      layers: [
        ['...J....', 'HJJJJJJH', 'HJJJJJJH'],
        ['........', 'HJ.JJJ.H', 'HJJJJJJH'],
        ['........', '........', '...FF...'],
        ['........', '........', '...FF...'],
      ],
    },
    {
      id: 'gauntlet_perimeter_gate', size: [12, 5, 4], lootContext: loot,
      palette: palette + { F: { furniture: 'gauntlet_perimeter_gate_notice' } },
      layers: [
        ['............', '............', 'JJ........JJ', 'JJCCCCCCCCJJ'],
        ['............', '............', 'JJ...FF...JJ', 'JJCCCCCCCCJJ'],
        ['............', '............', 'JJ...FF...JJ', 'JJCCCCCCCCJJ'],
        ['............', '............', 'JJ........JJ', 'JJCCCCCCCCJJ'],
        ['............', '............', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH'],
      ],
    },
  ],
}
