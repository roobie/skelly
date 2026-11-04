(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={ paper_sheet: ['paper', 'paper'], notebook: ['paper', 'paper'] },
).pack({
  models: [
    { id: 'paper_sheet', file: 'assets/models/paper_sheet.glb' },
    { id: 'notebook', file: 'assets/models/notebook.glb' },
  ],
})
