local resistance(blunt, cut, pierce, blast, fragment, breach, crush, acid) = {
  blunt: blunt, cut: cut, pierce: pierce, blast: blast, fragment: fragment, breach: breach, crush: crush, acid: acid,
};
local cracks = {
  color: '#1c1712', opacity: 0.9, widthBlocks: 0.035, strands: 3, segments: 5, jitterRadians: 0.6, branchChance: 0.35,
  steps: [{ from: 0.1, reach: 0.35 }, { from: 0.35, reach: 0.7 }, { from: 0.65, reach: 1 }],
};
local material(id, minimum, durability, mass, span, resist, tint, yield) = {
  id: id, minimumStrength: minimum, durability: durability, massKg: mass, span: span,
  resistance: resist, fallsTo: id + '_rubble', breakable: true, rubble: [{ item: yield, count: 1 }], blowSound: 'door_bash',
  broken: { tint: tint, strength: 0.6 },
  cracks: cracks,
};
local materials = [
  material('soil', 2, 30, 180, 0, resistance(0, 0.1, 0.4, 0, 0.4, 0, 0, 0.4), '#685744', 'rubble_stone'),
  material('masonry', 9, 300, 260, 2, resistance(0.1, 0.8, 0.8, 0.1, 0.7, 0, 0.1, 0.8), '#827b71', 'rubble_stone'),
  material('timber', 3.5, 100, 65, 3, resistance(0.1, 0, 0.5, 0.1, 0.4, 0, 0.1, 0.5), '#776144', 'wood_offcut'),
  material('metal', 9, 400, 180, 4, resistance(0.4, 0.7, 0.6, 0.2, 0.6, 0, 0.3, 0.6), '#6e6965', 'scrap_metal'),
  material('textile', 0, 15, 8, 1, resistance(0.5, 0, 0.1, 0, 0.1, 0, 0, 0), '#68604e', 'cloth_strip'),
  material('liquid', 0, 1, 125, 0, resistance(1, 1, 1, 1, 1, 1, 1, 1), '#52616b', 'rubble_stone') + { fallsTo: 'soil_rubble', breakable: false, rubble: [], cracks+: { steps: [] } },
];
{
  blockMaterials: materials,
  blocks: [
    {
      id: row[0].id + '_rubble', material: row[0].id, name: row[1], color: row[2], solid: true,
      pattern: 'rough', weatherable: false, drops: { default: 'item_drop_wood' },
      footsteps: { player: row[3] },
    }
    for row in [
      [materials[0], 'Loose earth', '#685744', 'footstep_mud'],
      [materials[1], 'Masonry rubble', '#827b71', 'footstep_stone'],
      [materials[2], 'Broken timber', '#776144', 'footstep_wood'],
      [materials[3], 'Twisted metal', '#6e6965', 'footstep_stone'],
      [materials[4], 'Torn fabric', '#68604e', 'footstep_leaves'],
    ]
  ],
}
