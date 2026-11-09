local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.hand-tools', [import '../models-hand-tools.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources + [
    {
      title: 'Project-built low-poly hand-tool and content stand-ins',
      url: 'https://github.com/roobie/skelly',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: ['assets/models/sewing_kit.glb'],
      changes: 'Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used.',
    },
  ],
}
