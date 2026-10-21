local base = import 'manifest.libsonnet';
base + {
  sources+: [
    {
      title: 'Project asset manifest sources',
      url: 'https://github.com/roobie/skelly/tree/main/packages/deadvox/src/content/base/assets',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: ['assets/manifest.jsonnet', 'assets/manifest.libsonnet'],
      changes: 'Original asset provenance data and its Jsonnet composition source.',
    },
  ],
}
