local base = import 'manifest.libsonnet';
base + {
  sources+: [
    {
      title: 'Project asset manifest sources',
      url: 'https://github.com/roobie/skelly/tree/main/packages/deadvox/src/content/base/assets',
      author: 'Björn Roberg',
      licence: 'CC-BY-NC-SA-4.0',
      download: null,
      files: ['assets/manifest.jsonnet', 'assets/manifest.libsonnet'],
      changes: 'Original asset provenance data and its Jsonnet composition source.',
    },
  ],
}
