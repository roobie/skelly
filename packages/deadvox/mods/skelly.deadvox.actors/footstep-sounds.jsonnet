// Product footsteps live here so shared blocks need no dependency on the actors that walk them.
local struts = [b for b in (import 'packages/mods/skelly.natural-world/block-materials.jsonnet').blocks if std.objectHas(b, 'strut')];
local rows(family, blocksBySound) = [
  { id: std.length(family) + '_' + family + '_' + block, family: family, block: block, sound: sound }
  for sound in std.objectFields(blocksBySound)
  for block in blocksBySound[sound]
];

{
  footstepSounds: rows('shambler', {
    shambler_step_grass: ['grass'],
    shambler_step_leaves: ['textile_rubble', 'fabric', 'carpet', 'leaves', 'leaf_litter', 'tall_grass'],
    // Wading borrows the mud event until the wading round gives water a sound of its own.
    shambler_step_mud: ['soil_rubble', 'dirt', 'water'],
    shambler_step_sand: ['sand'],
    shambler_step_stone: [
      'masonry_rubble', 'metal_rubble', 'stone', 'rock', 'asphalt', 'painted_asphalt', 'concrete', 'brick',
      'plaster', 'tiles', 'roof', 'window_frame', 'siding_red', 'siding_blue', 'galvanized', 'bitumen_felt', 'cobblestone_mossy',
      'dressed_stone', 'hazard_yellow', 'chain_link', 'sandbag', 'camo_woodland', 'steel_joist',
      'reinforced_concrete_rubble', 'slab_deck',
    ],
    shambler_step_wood: ['charred_remains', 'timber_rubble', 'planks', 'plank_wall', 'plank_floor', 'slab_floor', 'tree_trunk', 'tree_branch'],
  }) + rows('shambler', {
    shambler_step_stone: [b.id for b in struts if b.footsteps.player == 'footstep_stone'],
    shambler_step_wood: [b.id for b in struts if b.footsteps.player == 'footstep_wood'],
  }),
}
