(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ paper_sheet: ['paper', 'paper'], notebook: ['paper', 'paper'], folded_note: ['paper', 'paper'] },
).pack({
  models: [
    { id: 'paper_sheet', file: 'assets/models/paper_sheet.glb' },
    { id: 'folded_note', file: 'assets/models/folded_note.glb' },
  ] + (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.readables/things/index.json', [import 'readables.jsonnet', import 'packages/mods/skelly.manuals/manuals-items.jsonnet']),
})
