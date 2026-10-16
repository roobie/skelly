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
    {
      title: 'Gungen .357 Magnum revolver export',
      url: 'https://github.com/roobie/skelly/blob/main/gungen/designs/archetype-revolver.json',
      author: 'Skelly contributors',
      licence: 'CC0-1.0', download: null,
      files: ['assets/models/revolver.glb'],
      changes: 'Original project-built geometry exported by gungen. Moving assembly parts and the revolver metadata preserve the assembled rest pose for runtime composition; see gungen/docs/revolver-export.md.',
    },
    {
      title: 'Gungen .357 Magnum cartridge exports',
      url: 'https://github.com/roobie/skelly/blob/main/gungen/cartridges/357-magnum.json',
      author: 'Skelly contributors',
      licence: 'CC0-1.0', download: null,
      files: ['assets/models/round-357_h_magnum.glb', 'assets/models/case-357_h_magnum.glb'],
      changes: 'Original project-built presentation geometry exported from sourced external dimensions. Unknown typical overall length uses the sourced maximum for presentation; the projectile and primer use the generic visual proxies in gungen/src/ammo/roundProfile.ts, roundProfiles.',
    },
  ],
}
