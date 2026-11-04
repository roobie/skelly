local things = import '../exports/things.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  sources: [
    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/mods/skelly.structures/exports/things.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(things),
      changes: 'Original project-built geometry rebuilt from authored item and part data; masses and appearance belong to the tool source.',
    },
    {
      title: 'Thwack Sounds',
      url: 'https://opengameart.org/content/thwack-sounds',
      author: 'Jordan Irwin (AntumDeluge)',
      licence: 'CC0-1.0',
      download: 'thwack.zip',
      files: ['assets/audio/door_blocked_close-01.ogg'],
      changes: 'Converted the selected PCM WAV; trimmed leading silence, faded the tail, converted to 24 kHz mono Opus in Ogg, and applied loudness normalization plus true-peak limiting (final measured LUFS and true peak are in the d13b report).',
    },
    {
      title: '80 CC0 RPG SFX',
      url: 'https://opengameart.org/content/80-cc0-rpg-sfx',
      author: 'rubberduck',
      licence: 'CC0-1.0',
      download: '80-CC0-RPG-SFX.zip',
      files: ['assets/audio/door-open-03.ogg'],
      changes: 'Selected three blade, three wood and three metal variants; converted to 24 kHz mono Opus in Ogg containers; unused source files excluded',
    },
  ],
}
