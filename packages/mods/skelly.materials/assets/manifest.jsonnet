local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.materials', [import '../models-materials.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources + [
    {
      title: 'Project-built low-poly hand-tool and content stand-ins',
      url: 'https://github.com/roobie/skelly',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: [
        'assets/models/glass_shards.glb',
        'assets/models/wood_offcut.glb',
        'assets/models/rubber_strip.glb',
        'assets/models/cloth_bundle.glb',
      ],
      changes: 'Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used.',
    },
  ],
}
