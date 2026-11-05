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
      "title": "80 CC0 creature SFX",
      "url": "https://opengameart.org/content/80-cc0-creature-sfx",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "80-CC0-creature-SFX.zip",
      "files": ["assets/audio/shambler-hurt-01.ogg"],
      "changes": "Selected one hurt variant (two more were removed as too high-pitched); converted to 24 kHz mono Opus in Ogg containers; unused source files excluded"
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
        "assets/audio/door-open-03.ogg",
        "assets/audio/door-close-01.ogg",
        "assets/audio/door-close-02.ogg",
        "assets/audio/door-close-03.ogg"
      ],
      "changes": "Selected three blade, three wood and three metal variants; converted to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "Zombies Sound Pack",
      "url": "https://opengameart.org/content/zombies-sound-pack",
      "author": "artisticdude",
      "licence": "CC0-1.0",
      "download": "zombies.zip",
      "files": [
        "assets/audio/shambler-idle-01.ogg",
        "assets/audio/shambler-idle-02.ogg",
        "assets/audio/shambler-idle-03.ogg",
        "assets/audio/shambler-alert-04.ogg",
        "assets/audio/shambler-alert-05.ogg",
        "assets/audio/shambler-alert-06.ogg",
        "assets/audio/shambler-attack-07.ogg",
        "assets/audio/shambler-attack-08.ogg",
        "assets/audio/shambler-attack-09.ogg"
      ],
      "changes": "Selected nine zombie vocalizations; converted from WAV to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "37 hits/punches",
      "url": "https://opengameart.org/content/37-hitspunches",
      "author": "Independent.nu",
      "licence": "CC0-1.0",
      "download": "independent_nu_ljudbank-hits_and_punches.7z",
      "files": [
        "assets/audio/shambler-hit-05.ogg",
        "assets/audio/shambler-hit-06.ogg",
        "assets/audio/shambler-hit-07.ogg"
      ],
      "changes": "Selected seven impact variants; converted from FLAC to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "Different steps on wood, stone, leaves, gravel and mud",
      "url": "https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud",
      "author": "TinyWorlds",
      "licence": "CC0-1.0",
      "download": "[kdd]DifferentSteps_0.zip",
      "files": [
        "assets/audio/footstep-wood-01.ogg",
        "assets/audio/footstep-wood-02.ogg",
        "assets/audio/footstep-wood-03.ogg",
        "assets/audio/footstep-stone-01.ogg",
        "assets/audio/footstep-leaves-01.ogg",
        "assets/audio/footstep-leaves-02.ogg",
        "assets/audio/footstep-mud-01.ogg"
      ],
      "changes": "Selected wood, stone, leaves and mud steps; converted to mono Opus in Ogg containers; unused gravel sample excluded because the game has no gravel block"
    },
    {
      "title": "Fantozzi's Footsteps (Grass/Sand & Stone)",
      "url": "https://opengameart.org/content/fantozzis-footsteps-grasssand-stone",
      "author": "Fantozzi",
      "licence": "CC0-1.0",
      "download": "Fantozzi-footsteps.7z",
      "files": [
        "assets/audio/footstep-grass-sand-01.ogg",
        "assets/audio/footstep-grass-sand-02.ogg",
        "assets/audio/footstep-grass-sand-03.ogg",
        "assets/audio/footstep-grass-sand-04.ogg",
        "assets/audio/footstep-grass-sand-05.ogg",
        "assets/audio/footstep-grass-sand-06.ogg",
        "assets/audio/footstep-stone-02.ogg",
        "assets/audio/footstep-stone-03.ogg",
        "assets/audio/footstep-stone-04.ogg",
        "assets/audio/footstep-stone-05.ogg",
        "assets/audio/footstep-stone-06.ogg"
      ],
      "changes": "Selected six grass/sand and five stone steps (the source says its sand steps also sound like grass); converted from FLAC to mono Opus in Ogg containers; unused sixth stone sample excluded"
    },
    {
      "title": "100 CC0 SFX #2",
      "url": "https://opengameart.org/content/100-cc0-sfx-2",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "sfx_100_v2.zip",
      "files": [
        "assets/audio/footstep-mud-02.ogg",
        "assets/audio/footstep-mud-03.ogg",
        "assets/audio/footstep-mud-04.ogg"
      ],
      "changes": "Selected three wet-footstep variations (sfx100v2_footstep_wet_01–03.ogg); converted from stereo 48 kHz Vorbis to mono 48 kHz Opus in Ogg containers without loudness normalization; sfx100v2_misc_36.ogg kept byte-identical as received and renamed player-block-full-01.ogg; unused source effects excluded"
    },
    {
      "title": "Project-built low-poly hand-tool and content stand-ins",
      "url": "https://github.com/roobie/skelly",
      "author": "Skelly contributors",
      "licence": "CC0-1.0",
      "download": null,
      "files": ["assets/models/folded_note.glb"],
      "changes": "Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used."
    }
  ]
}
