local content = [
  'benchmark-city', 'block-materials', 'blocks', 'body', 'camp', 'compression', 'controls',
  'crisis-hq-fixtures', 'crisis-hq', 'dayCycle', 'figures-player', 'furniture-cabins',
  'furniture-hunting', 'furniture-playtest', 'furniture', 'gauntlet-look', 'gauntlet-start',
  'gauntlet', 'graphics', 'hunting-cabins', 'inventory', 'item-wear', 'items-ammunition',
  'items-attachments', 'items-explosives', 'items-food', 'items-gun-parts', 'items-other',
  'items-pistol', 'items-playtest', 'items-revolver', 'items-slice2-content', 'items-tools',
  'items-wearables', 'ladders', 'layouts-cabins', 'layouts-playtest', 'layouts-stairs',
  'layouts-test-house', 'layouts-voice-size', 'layouts-water', 'layouts', 'locks', 'look',
  'loot-workshop', 'loot', 'map-kits', 'models-attachments', 'models-firearms',
  'models-gun-parts', 'models-items', 'models-melee', 'player', 'power', 'range', 'readables',
  'recipes', 'rural-medical-fixtures', 'rural-medical', 'rural-police-fixtures', 'rural-police',
  'rural-substation-fixtures', 'rural-substation', 'saves', 'scenarios', 'senses',
  'site-generation', 'sounds-block', 'sounds-furniture', 'sounds-pump', 'sounds-revolver',
  'sounds-synth', 'sounds-weapons', 'sounds', 'templates-cabins', 'templates-medical',
  'templates-playtest', 'templates-stairs', 'templates-test-house', 'templates-workshop',
  'templates', 'tutorial', 'ui', 'vegetation', 'vehicles', 'weathering', 'zombies',
];
local guns = [
  'ak_slant_compensator', 'barrel_ak_medium', 'barrel_ar_large_long', 'barrel_ar_large_medium',
  'barrel_ar_medium', 'barrel_pistol', 'barrel_pump_medium', 'barrel_sporter_long',
  'bolt_carrier_ak', 'bolt_carrier_ar_large', 'bolt_carrier_ar', 'bolt_carrier_bolt',
  'bolt_carrier_pump', 'bolt_handle_sporter', 'bolt_knob_sporter',
  'case_12_h_gauge_h_00_h_buck', 'case_308_h_winchester', 'case_357_h_magnum',
  'case_5_d_56x45', 'case_7_d_62x39', 'case_9x19', 'charging_handle_ar_large',
  'charging_handle_ar', 'foregrip', 'forend_pump', 'front_bead', 'front_sight_ak',
  'front_sight_ar', 'front_sight_sporter', 'gas_block_ak', 'gas_cylinder_ak', 'grip_ak',
  'grip_ar_long', 'grip_standard', 'handguard_ak', 'handguard_ar_clamped',
  'handguard_ar_large_clamped', 'handguard_ar_large_free_float', 'handguard_sporter',
  'improvised_suppressor', 'integral_magazine', 'lower_ak', 'lower_ar_large', 'lower_ar',
  'lower_pump', 'lower_sporter', 'magazine_akm_30', 'magazine_pistol_9', 'magazine_stanag_20',
  'magazine_stanag_30', 'optic_digital_thermal', 'optic_fixed_prism_4x', 'optic_high_mag_5_25x',
  'optic_holographic', 'optic_hunting_3_9x', 'optic_lpvo_1_6x', 'optic_mini_reflex',
  'optic_tube_dot', 'pistol_frame', 'pistol_service', 'pistol_slide', 'rail_front_sight',
  'real_suppressor', 'rear_sight_ak', 'rear_sight_sporter', 'receiver_ak', 'receiver_ar_large',
  'receiver_ar', 'receiver_pump', 'receiver_sporter', 'revolver_barrel', 'revolver_crane',
  'revolver_cylinder', 'revolver_ejector', 'revolver_frame', 'revolver_grip',
  'revolver_hammer', 'revolver', 'revolver_trigger', 'rifle_ak', 'rifle_assault',
  'rifle_hunting', 'round_12_h_gauge_h_00_h_buck', 'round_308_h_winchester',
  'round_357_h_magnum', 'round_5_d_56x45', 'round_7_d_62x39', 'round_9x19', 'shotgun_pump',
  'stock_ak_long', 'stock_m4_long', 'stock_m4_medium', 'stock_sporting_medium',
  'stock_tapered_medium', 'tactical_flashlight_mount', 'tube_magazine',
];
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
{
  id: 'base',
  version: '1',
  tier: 'product',
  product: true,
  dependencies: [],
  overrides: [],
  files: [{ path: name + '.json', kind: 'content' } for name in content] +
         [{ path: 'gungen/' + name + '.model.json', kind: 'json' } for name in guns] +
         [{ path: 'things/' + model.id + '.model.json', kind: 'json' } for model in things] +
         [{ path: 'things/index.json', kind: 'json' }, { path: 'assets/manifest.json', kind: 'json' }] +
         [{ path: file, kind: 'asset' } for file in std.uniq(std.sort(std.flattenArrays([source.files for source in assets.sources])))],
}
