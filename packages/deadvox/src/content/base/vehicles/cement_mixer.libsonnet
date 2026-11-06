// Items and blueprint for the cement mixer, derived from the tipper truck with its tub removed. Its added rows are in `packages/thing-authoring-tool/vehicles/cement_mixer.libsonnet`.
local kit = import '../vehicle-kit.libsonnet';
local base = (import 'tipper_truck.libsonnet').blueprint;
local part = kit.part;
local fitting = kit.fitting;
local pair = kit.pair;
local on = kit.on;
local origin = kit.origin;
local pile = kit.pileSize;
local tubFittings = ['subframe', 'tub_floor', 'tub_front', 'tailgate', 'tip_ram', 'tub_cargo', 'tub_side_near', 'tub_side_far'];
{
  items: [
    part('cement_mixer_subframe', 'Cement mixer subframe', pile, ['structure']),
    part('cement_mixer_drive', 'Cement mixer drum drive', pile, ['structure']),
    part('cement_mixer_drum', 'Cement mixer drum', pile, ['storage', 'structure']),
    part('cement_mixer_roller_stand', 'Cement mixer roller stand', pile, ['structure']),
    part('cement_mixer_rear_frame', 'Cement mixer rear frame', pile, ['structure']),
    part('cement_mixer_hopper', 'Cement mixer charging hopper', pile, []),
    part('cement_mixer_chute', 'Cement mixer discharge chute', pile, []),
    part('cement_mixer_platform', 'Cement mixer ladder and platform', pile, ['structure']),
    part('cement_mixer_water_tank', 'Cement mixer water tank', pile, ['storage']),
  ],
  blueprint: base + {
    id: 'cement_mixer',
    name: 'Cement mixer',
    fittings: [f for f in base.fittings if !std.member(tubFittings, f.id)] + [
      fitting('subframe', 'cement_mixer_subframe', origin, ['chassis']),
      fitting('drive', 'cement_mixer_drive', origin, ['subframe']),
      fitting('rear_frame', 'cement_mixer_rear_frame', origin, ['subframe']),
      fitting('drum', 'cement_mixer_drum', origin, ['drive', 'roller_stand_near', 'roller_stand_far']),
      fitting('hopper', 'cement_mixer_hopper', origin, ['rear_frame']),
      fitting('chute', 'cement_mixer_chute', origin, ['rear_frame']),
      fitting('platform', 'cement_mixer_platform', origin, ['rear_frame']),
      fitting('water_tank', 'cement_mixer_water_tank', origin, ['subframe']),
    ] + pair('roller_stand', 'cement_mixer_roller_stand', origin, on(['subframe'])),
  },
}
