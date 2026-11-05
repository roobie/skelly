local authored = [
    import 'things/cartridge_box_308_h_winchester.model.json',
    import 'things/cartridge_box_5_d_56x45.model.json',
    import 'things/cartridge_box_7_d_62x39.model.json',
    import 'things/cartridge_box_357_h_magnum.model.json',
    import 'things/shotshell_box.model.json',
    import 'things/ammo_can.model.json',
    (import 'things/flashlight.model.json') + { grip: { at: [0.085, 0, 0] }, anchors: { lens: [0.199, 0, 0] } },
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
    if !std.member([entry.id for entry in authored], model.id)
  ],
})
