local authored = [
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
