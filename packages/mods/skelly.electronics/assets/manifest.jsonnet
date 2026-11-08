{
  sources: (import 'tools/jsonnet/lib/built-pack.libsonnet').sources('skelly.electronics') + [
    {
      title: 'Project-built low-poly hand-tool and content stand-ins',
      url: 'https://github.com/roobie/skelly',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: [
        'assets/models/circuit_board.glb',
        'assets/models/glass_lens.glb',
        'assets/models/broken_toaster.glb',
        'assets/models/table_fan.glb',
        'assets/models/cracked_phone.glb',
        'assets/models/broken_clock.glb',
        'assets/models/electrical_repair_kit.glb',
        'assets/models/glass_bulb.glb',
      ],
      changes: 'Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used.',
    },
  ],
}
