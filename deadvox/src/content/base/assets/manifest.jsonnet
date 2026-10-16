local base = import 'manifest.libsonnet';
local original(title, url, files) = {
  title: title,
  url: url,
  author: 'Skelly contributors',
  licence: 'CC0-1.0',
  download: null,
  files: files,
  changes: 'Original model geometry generated through the Gungen export pipeline.',
};
base + {
  sources+: [
    original('Project asset manifest sources', 'https://github.com/roobie/skelly/tree/main/deadvox/src/content/base/assets', ['assets/manifest.jsonnet', 'assets/manifest.libsonnet']) + { changes: 'Original asset provenance data and its Jsonnet composition source.' },
    original('Gungen hunting rifle export', 'https://github.com/roobie/skelly/blob/main/gungen/designs/hunting-rifle.json', ['assets/models/rifle_hunting.glb']),
    original('Gungen civilian .308 Winchester cartridge exports', 'https://github.com/roobie/skelly/blob/main/gungen/cartridges/308-winchester.json', ['assets/models/round-308_h_winchester.glb', 'assets/models/case-308_h_winchester.glb']),
    original('Gungen hunting scope export', 'https://github.com/roobie/skelly/blob/main/gungen/src/gun/optics.ts', ['assets/models/optic_hunting_3_9x.glb']),
  ],
}
