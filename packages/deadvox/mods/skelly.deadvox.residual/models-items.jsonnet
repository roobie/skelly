local authored = [
    import 'things/cartridge_box_308_h_winchester.model.json',
    import 'things/cartridge_box_5_d_56x45.model.json',
    import 'things/cartridge_box_7_d_62x39.model.json',
    import 'things/cartridge_box_357_h_magnum.model.json',
    import 'things/shotshell_box.model.json',
    import 'things/ammo_can.model.json',
    import 'things/jerry_can.model.json',
    import 'things/gas_canister.model.json',
    (import 'things/frag_grenade.model.json') + {
      lever: { piece: 'lever', launchMetresPerRealSecond: 3, spinDegreesPerRealSecond: 1080, lifetimeRealSeconds: 1.5 },
      pin: { piece: 'pin' },
    },
    import 'things/torch.model.json',
    (import 'things/flashlight.model.json') + { grip: { at: [0.085, 0, 0] }, anchors: { lens: [0.199, 0, 0] } },
    import 'things/candle.model.json',
    import 'things/bear_trap.model.json',
    { "id": "lamp_oil_bottle", "file": "assets/models/lamp_oil_bottle.glb" },
    { "id": "circuit_board", "file": "assets/models/circuit_board.glb" },
    { "id": "glass_lens", "file": "assets/models/glass_lens.glb" },
    { "id": "stab_vest", "file": "assets/models/stab_vest.glb" },
    { "id": "riot_helmet_view", "file": "assets/models/riot_helmet_view.glb" },
    import 'things/fuse.model.json',
    { "id": "broken_toaster", "file": "assets/models/broken_toaster.glb" },
    import 'things/dead_desk_lamp.model.json',
    { "id": "table_fan", "file": "assets/models/table_fan.glb" },
    { "id": "cracked_phone", "file": "assets/models/cracked_phone.glb" },
    { "id": "broken_clock", "file": "assets/models/broken_clock.glb" },
    { "id": "electrical_repair_kit", "file": "assets/models/electrical_repair_kit.glb" },
    { "id": "glass_bulb", "file": "assets/models/glass_bulb.glb" },
    { "id": "folded_note", "file": "assets/models/folded_note.glb" },
    import 'things/shambler_torso.model.json',
    import 'things/shambler_head.model.json',
    import 'things/shambler_left_arm.model.json',
    import 'things/shambler_right_arm.model.json',
    import 'things/shambler_left_leg.model.json',
    import 'things/shambler_right_leg.model.json'
];
(import 'item-presentation.libsonnet').pack({
  // Explicit registrations must not also appear through the export index.
  models: authored + [
    model
    for model in import 'things/index.json'
    if !std.member([entry.id for entry in authored + (import 'models-melee.jsonnet').models], model.id)
  ],
})
