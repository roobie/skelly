// Gauntlet shop fronts, kept apart so they can leave with their scenario.
local family = 'shambler';
{
  footstepSounds: [
    { id: std.length(family) + '_' + family + '_' + block, family: family, block: block, sound: 'shambler_step_stone' }
    for block in ['shop_blue', 'shop_green', 'shop_orange', 'shop_yellow', 'shop_red', 'shop_white', 'shop_produce', 'shop_grille']
  ],
}
