local things = import '../exports/things.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  sources: [
    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/mods/skelly.flame-tools/exports/things.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(things),
      changes: 'Original project-built geometry rebuilt from authored item and part data; masses and appearance belong to the tool source.',
    },
  ],
}
