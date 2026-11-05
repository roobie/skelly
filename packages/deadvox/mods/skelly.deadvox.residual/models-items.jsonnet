local authored = [
    { "id": "folded_note", "file": "assets/models/folded_note.glb" }
];
(import 'item-presentation.libsonnet').pack({
  // Explicit registrations must not also appear through the export index.
  models: authored + [
    model
    for model in import 'things/index.json'
    if !std.member([entry.id for entry in authored], model.id)
  ],
})
