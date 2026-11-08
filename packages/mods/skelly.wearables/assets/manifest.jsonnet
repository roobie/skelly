{
  sources: (import 'tools/jsonnet/lib/built-pack.libsonnet').sources('skelly.wearables') + [
    {
      title: '75 CC0 Breaking/Falling/Hit SFX',
      url: 'https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx',
      author: 'rubberduck',
      licence: 'CC0-1.0',
      download: 'brk.zip',
      files: ['assets/audio/pouch_take-01.ogg'],
      changes: 'Selected two wooden item-drop clips, a pouch-handling clip, and a placeholder fist hit; trimmed leading silence, faded tails, converted to 24 kHz mono Opus in Ogg, and applied loudness normalization plus true-peak limiting. The fist-hit placeholder is wired to the live and restored melee-action path when the fists profile is active.',
    },
    {
      title: 'Project-built low-poly hand-tool and content stand-ins',
      url: 'https://github.com/roobie/skelly',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: ['assets/models/stab_vest.glb', 'assets/models/riot_helmet_view.glb'],
      changes: 'Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used.',
    },
  ],
}
