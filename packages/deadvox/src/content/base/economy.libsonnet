local usages = ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military', 'Infected'];
local tiers = ['Tier1', 'Tier2', 'Tier3'];
local militaryItems = [
  'rifle_assault', 'rifle_ak',
  'cartridge_5_d_56x45', 'cartridge_7_d_62x39',
  'cartridge_box_5_d_56x45', 'cartridge_box_7_d_62x39',
  'magazine_stanag_30', 'magazine_stanag_20', 'magazine_akm_30', 'ak_slant_compensator',
  'night_vision_goggles',
];
local medicalItems = ['codeine', 'morphine'];
local policeItems = ['stab_vest', 'riot_helmet'];
local huntingItems = ['bear_trap'];
local notSpawnable = [
  'pistol_service', 'magazine_pistol_9', 'cartridge_9x19', 'spent_case_9x19',
  'work_in_progress', 'debug_shotgun_pump', 'spent_case_308_h_winchester', 'spent_case_357_h_magnum',
  'spent_case_5_d_56x45', 'spent_case_7_d_62x39', 'spent_case_12_h_gauge_h_00_h_buck',
  'beans', 'soup', 'soda', 'opened_beans', 'opened_soup', 'opened_soda', 'empty_can', 'empty_soda_can',
  'shambler_torso', 'shambler_head', 'shambler_left_arm', 'shambler_right_arm',
  'shambler_left_leg', 'shambler_right_leg',
  'engine_hoist',
]
// A loose gun part has no use until players can assemble guns, so none spawns as loot (`things/WORK.md`, "Decisions").
+ [entry.id for entry in (import 'packages/gun-authoring-tool/src/gun/catalogue.jsonnet').parts if std.objectHas(entry, 'params')];
local commonItems = [
  'rifle_hunting', 'cartridge_308_h_winchester', 'cartridge_box_308_h_winchester', 'optic_hunting_3_9x',
  'revolver_357', 'cartridge_357_h_magnum', 'cartridge_box_357_h_magnum', 'cartridge_box_9x19',
  'camp_armoury_key', 'camp_supply_manifest', 'camp_hq_safe_key', 'camp_hq_safe_note',
  'optic_digital_thermal', 'optic_fixed_prism_4x', 'optic_high_mag_5_25x', 'optic_holographic',
  'optic_lpvo_1_6x', 'optic_mini_reflex', 'optic_tube_dot', 'rail_front_sight', 'real_suppressor',
  'tactical_flashlight_mount', 'weapon_sling', 'foregrip', 'frag_grenade',
  'canned_beans', 'canned_soup', 'crackers', 'apple', 'chocolate_bar', 'soda_can', 'water_bottle', 'juice_carton',
  'aa_battery', 'rechargeable_aa_battery', 'bandage', 'antiseptic', 'antibiotics', 'painkillers', 'rag', 'duct_tape', 'nails', 'scrap_metal',
  'field_manual', 'camp_craft_book', 'home_repair_book', 'workshop_notes', 'paperback', 'portable_radio', 'jerry_can',
  'ammo_can', 'shell_12_gauge_00_buck', 'shotshell_box', 'dad_cabin_key', 'baseball_cap', 'evacuation_note', 'hunter_logbook',
  'pharmacy_key', 'medical_research_log', 'lamp_oil', 'glass_shards', 'electrical_tape', 'fastener_pack',
  'wood_offcut', 'rubber_strip', 'circuit_board', 'glass_lens', 'small_spring', 'cloth_strip', 'sewing_thread',
  'fuse', 'nylon_cord', 'wire_strippers', 'adjustable_pliers', 'sewing_kit', 'broken_toaster', 'dead_desk_lamp', 'oil_lamp',
  'broken_table_fan', 'cracked_phone', 'broken_clock', 'sewing_repair_kit', 'electrical_repair_kit',
  'taped_flashlight_mount', 'scrap_foregrip', 'hinge_set', 'glass_bulb', 'hand_saw', 'screwdriver', 'wrench',
  'improvised_suppressor', 'compass', 'crowbar', 'sledgehammer', 'blowtorch', 'scissor_jack', 'bottle_jack', 'gas_canister', 'hammer', 'kitchen_knife', 'kabar', 'machete', 'can_opener', 'whetstone', 'door_bar',
  'baseball_bat', 'steel_pipe', 'flashlight', 'headlamp', 'torch', 'candle', 'glowstick', 'road_flare', 'lighter', 'matches',
  'jeans', 'cargo_pants', 'rubber_boots', 'sneakers', 'hoodie', 'jacket', 'utility_vest', 'fanny_pack', 'school_backpack', 'hiking_backpack',
  'shed_key', 'pump_shotgun', 'regional_map', 'stick', 'wax', 'wooden_plank', 'repair_kit', 'copper_wire', 'field_patch',
];
local residential = [
  'small_house', 'bungalow', 'corner_store', 'dads_cabin', 'hunter_cabin',
  'playtest_house', 'playtest_store', 'playtest_dads_cabin', 'playtest_hunter_cabin',
  'hen_house', 'rickety_fence', 'stairs_house', 'stairs_cabin',
];
local industrial = [
  'shed', 'locked_shed', 'woodshed', 'playtest_tool_shack',
  'gas_station', 'playtest_gas_station', 'hardware_store', 'garage',
  'workshop_hall', 'workshop_office', 'workshop_parts_store', 'workshop_yard', 'workshop_roof_ladder',
];
local medical = ['medical_hall', 'triage_tent'];
local military = [
  'camp_armoury', 'camp_command_tent', 'camp_container', 'camp_tent',
  'camp_watchtower', 'camp_wall_run', 'camp_wall_run_crouch_hole', 'camp_sandbag_post',
  'camp_hq', 'camp_gate', 'camp_gate_damaged', 'camp_gate_return',
];
local context(template) =
  assert std.member(residential + industrial + medical + military, template) : 'author a loot context for ' + template;
  if std.member(military, template) then { usage: ['Military'], tier: 'Tier2' }
  else if std.member(medical, template) then { usage: ['Medical'], tier: 'Tier1' }
  else if std.member(industrial, template) then { usage: ['Industrial'], tier: 'Tier1' }
  else { usage: ['Residential'], tier: 'Tier1' };
local anchorUsage(template, char, entry) =
  if std.member(['dads_cabin', 'playtest_dads_cabin'], template) && char == 'G' then ['Hunting']
  else if std.member(['hunter_cabin', 'playtest_hunter_cabin'], template) && char == 'C' then ['Hunting']
  else if template == 'camp_hq' && char == 'R' then ['Residential']
  else null;
local authorTemplate(template) = template + {
  lootContext: context(template.id),
  palette: {
    [char]:
      local entry = template.palette[char];
      local override = if std.type(entry) == 'object' then anchorUsage(template.id, char, entry) else null;
      if override == null then entry else entry + { lootUsage: override }
    for char in std.objectFields(template.palette)
  },
};
// Vehicle parts arrive fitted to vehicles, so none spawns as loose loot. A placed-only item (`notLoot`) is never rolled.
local spawnsLoose(item) = !(std.objectHas(item, 'vehicle') || std.get(item, 'notLoot', false) || std.member(notSpawnable, item.id));
local authorItem(item) =
  assert !spawnsLoose(item) || std.member(commonItems + militaryItems + medicalItems + policeItems + huntingItems, item.id) : 'author economy metadata for ' + item.id;
  { workInProgress: false, notLoot: false } + item + {
    economy:
      if !spawnsLoose(item) then { usage: [], tiers: [] }
      else if std.member(militaryItems, item.id) then { usage: ['Military'], tiers: ['Tier2', 'Tier3'] }
      else if std.member(medicalItems, item.id) then { usage: ['Medical'], tiers: tiers }
      else if std.member(policeItems, item.id) then { usage: ['Police'], tiers: tiers }
      else if std.member(huntingItems, item.id) then { usage: ['Hunting'], tiers: tiers }
      else { usage: usages, tiers: tiers },
  };
{
  pack(content):: content
    + (if std.objectHas(content, 'items') then { items: [authorItem(item) for item in content.items] } else {})
    + (if std.objectHas(content, 'templates') then { templates: [authorTemplate(template) for template in content.templates] } else {})
    + (if std.objectHas(content, 'layouts') then {
      layouts: [layout + {
        lootContext: { usage: ['Residential'], tier: 'Tier1' },
        buildings: [building + { lootContext: context(building.template) } for building in layout.buildings],
      } for layout in content.layouts],
    } else {}),
}
