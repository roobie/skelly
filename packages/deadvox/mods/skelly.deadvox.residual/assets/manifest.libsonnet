local things = import '../exports/things.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  "sources": [
    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/deadvox/mods/skelly.deadvox.residual/exports/things.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(things),
      changes: 'Original project-built geometry rebuilt from authored item and part data; masses and appearance belong to the tool source.',
    },
    {
      "title": "80 CC0 RPG SFX",
      "url": "https://opengameart.org/content/80-cc0-rpg-sfx",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "80-CC0-RPG-SFX.zip",
      "files": [
        "assets/audio/melee-swing-01.ogg",
        "assets/audio/melee-swing-02.ogg",
        "assets/audio/melee-swing-03.ogg",
        "assets/audio/door-open-01.ogg",
        "assets/audio/door-open-02.ogg",
        "assets/audio/door-close-01.ogg",
        "assets/audio/door-close-02.ogg",
        "assets/audio/door-close-03.ogg"
      ],
      "changes": "Selected three blade, three wood and three metal variants; converted to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    }
  ]
}
