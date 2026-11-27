local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
local struts = import 'struts.libsonnet';
local beams = import 'beams.libsonnet';
local resistance(blunt, cut, pierce, blast, fragment, breach, crush, acid) = {
  blunt: blunt, cut: cut, pierce: pierce, blast: blast, fragment: fragment, breach: breach, crush: crush, acid: acid,
};
local cracks = {
  color: '#1c1712', opacity: 0.9, widthBlocks: 0.035, strands: 3, segments: 5, jitterRadians: 0.6, branchChance: 0.35,
  rootSpreadBlocks: 0.15, strandLengthBlocks: 0.5, branchSwingRadians: 0.7853981633974483, branchStepFactor: 0.6,
  tipWidthFactor: 0.4, strandSpacingJitter: 0.25, branchSegmentShare: 0.5,
  // Shares of the range below the repair ceiling; the first starts at the ceiling itself.
  steps: [{ from: 0, reach: 0.35 }, { from: 0.4, reach: 0.7 }, { from: 0.75, reach: 1 }],
};
local material(id, minimum, durability, mass, span, resist, tint, yield, clearTime) = {
  id: id, minimumStrength: minimum, durability: durability, massKg: mass, span: span,
  resistance: resist, structural: false, fallsTo: { block: id + '_rubble' }, breakable: true, rubble: [{ item: yield, count: 1 }],
  rubbleClearTimeGameMinutes: clearTime, blowSound: 'door_bash',
  broken: { tint: tint, strength: 0.6 },
  cracks: cracks,
};
local materials = [
  material('soil', 2, 30, 180, 0, resistance(0, 0.1, 0.4, 0, 0.4, 0, 0, 0.4), '#685744', 'rubble_stone', 3),
  material('masonry', 9, 300, 260, 1, resistance(0.1, 0.8, 0.8, 0.1, 0.7, 0, 0.1, 0.8), '#827b71', 'rubble_stone', 12),
  // Pending sourced member calibration; retain the existing reach, now in metres.
  material('timber', 5, 100, 65, 1.5, resistance(0.1, 0, 0.5, 0.1, 0.4, 0, 0.1, 0.5), '#776144', 'wood_offcut', 6) + {
    structural: true,
    flammability: { ignitionStrength: 10, burnDurationGameMinutes: 2, burnsTo: 'charred_remains' },
  },
  material('metal', 9, 400, 180, 2, resistance(0.4, 0.7, 0.6, 0.2, 0.6, 0, 0.3, 0.6), '#6e6965', 'scrap_metal', 12) + { structural: true },
  material('textile', 0, 15, 8, 0.5, resistance(0.5, 0, 0.1, 0, 0.1, 0, 0, 0), '#68604e', 'cloth_strip', 2),
  material('liquid', 0, 1, 125, 0, resistance(1, 1, 1, 1, 1, 1, 1, 1), '#52616b', 'rubble_stone', 3) + { fallsTo: { block: 'soil_rubble' }, breakable: false, rubble: [], cracks+: { steps: [] } },
  // Pending sourced member calibration; retain the existing reach, now in metres.
  material('reinforced_concrete', 9, 400, 300, 3.5, resistance(0.2, 0.8, 0.8, 0.15, 0.7, 0, 0.2, 0.8), '#87847d', 'rubble_stone', 15) + { structural: true },
];
local charredMaterial = material('charred', 0, 12, 12, 0, resistance(0, 0, 0, 0, 0, 0, 0, 0), '#29231f', 'wood_offcut', 2) + {
  structural: true, fallsTo: { block: 'charred_remains' },
};
{
  fireTuning: [{ id: 'core', capability: 'fire', cellsPerTick: 64 }],
  blockMaterials: materials + [charredMaterial],
  blocks: beams([
    // Steel's beam override awaits the endpoint/clear-span decision; use the existing material reach until then.
    { id: 'steel', material: 'metal', name: 'Steel beam', color: '#6e4436', footstep: 'footstep_stone' },
    // Pending sourced member calibration; retain the material's existing reach in metres.
    { id: 'timber', material: 'timber', name: 'Timber beam', color: '#a0763f', footstep: 'footstep_wood', span: materials[2].span, burnsTo: 'charred_remains' },
    { id: 'concrete', material: 'reinforced_concrete', name: 'Concrete beam', color: '#87847d', footstep: 'footstep_stone', span: materials[6].span },
  ]) + struts([
    { id: 'steel', material: 'metal', name: 'Steel strut', color: '#6e6965', widthBlocks: 0.16, yields: materials[3].rubble, footstep: 'footstep_stone' },
    { id: 'timber', material: 'timber', name: 'Timber strut', color: '#a0763f', widthBlocks: 0.22, yields: materials[2].rubble, footstep: 'footstep_wood', burnsTo: 'charred' },
    { id: 'charred', material: 'charred', name: 'Charred strut', color: '#29231f', widthBlocks: 0.22, yields: charredMaterial.rubble, footstep: 'footstep_wood' },
  ]) + [{
    id: 'charred_remains', material: 'charred', name: 'Charred remains', color: '#29231f', solid: true,
    pattern: 'rough', weatherable: false, drops: { default: 'item_drop_wood' } + landings.forBlock('timber'),
    footsteps: { player: 'footstep_wood' },
  }] + [
    {
      id: row[0].id + '_rubble', material: row[0].id, name: row[1], color: row[2], solid: true,
      pattern: 'rough', weatherable: false, drops: { default: 'item_drop_wood' } + landings.forBlock(row[0].id),
      footsteps: { player: row[3] },
    }
    for row in [
      [materials[0], 'Loose earth', '#685744', 'footstep_mud'],
      [materials[1], 'Masonry rubble', '#827b71', 'footstep_stone'],
      [materials[2], 'Broken timber', '#776144', 'footstep_wood'],
      [materials[3], 'Twisted metal', '#6e6965', 'footstep_stone'],
      [materials[4], 'Torn fabric', '#68604e', 'footstep_leaves'],
      [materials[6], 'Broken slab', '#87847d', 'footstep_stone'],
    ]
  ],
}
