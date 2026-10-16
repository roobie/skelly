local base = import 'manifest.libsonnet';
base + {
  sources+: [
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
