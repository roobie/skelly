local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.ground-vehicles', [import '../vehicles.jsonnet', import '../troop-carrier.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources + [
    {
      title: '80 CC0 RPG SFX',
      url: 'https://opengameart.org/content/80-cc0-rpg-sfx',
      author: 'rubberduck',
      licence: 'CC0-1.0',
      download: '80-CC0-RPG-SFX.zip',
      files: [
        'assets/audio/door-open-01.ogg',
        'assets/audio/door-open-02.ogg',
        'assets/audio/door-open-03.ogg',
        'assets/audio/door-close-01.ogg',
        'assets/audio/door-close-02.ogg',
        'assets/audio/door-close-03.ogg',
      ],
      changes: 'Copied from skelly.structures, which selected and converted them to 24 kHz mono Opus in Ogg containers',
    },
  ],
}
