(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ paper_sheet: ['paper', 'paper'], notebook: ['paper', 'paper'], folded_note: ['paper', 'paper'] },
).pack({
  models: [
    { id: 'paper_sheet', file: 'assets/models/paper_sheet.glb' },
    { id: 'folded_note', file: 'assets/models/folded_note.glb' },
  ] + import 'packages/skelly-assets/built/skelly.readables/things/index.json',
})
