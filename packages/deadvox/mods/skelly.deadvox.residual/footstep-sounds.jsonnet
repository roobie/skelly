// Which sound the product's actors make on which block; a core or theme block names only the player's own step.
local rows(family, blocksBySound) = [
  { id: family + '__' + block, family: family, block: block, sound: sound }
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
      'plaster', 'tiles', 'roof', 'window_frame', 'siding_red', 'siding_blue', 'galvanized', 'cobblestone_mossy',
      'dressed_stone', 'hazard_yellow', 'chain_link', 'sandbag', 'camo_woodland',
      // Gauntlet shop fronts, kept apart so they can leave with their scenario.
      'shop_blue', 'shop_green', 'shop_orange', 'shop_yellow', 'shop_red', 'shop_white', 'shop_produce', 'shop_grille',
    ],
    shambler_step_wood: ['timber_rubble', 'planks', 'tree_trunk', 'tree_branch'],
  }),
}
