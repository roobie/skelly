local things = import '../exports/things.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  sources: [
    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/mods/skelly.containers/exports/things.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(things),
      changes: 'Original project-built geometry rebuilt from authored item and part data; masses and appearance belong to the tool source.',
    },
    {
      title: 'Project-built low-poly hand-tool and content stand-ins',
      url: 'https://github.com/roobie/skelly',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: ['assets/models/lamp_oil_bottle.glb'],
      changes: 'Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used.',
    },
  ],
}
