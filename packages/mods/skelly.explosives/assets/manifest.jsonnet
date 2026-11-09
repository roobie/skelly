local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.explosives', [import '../models-explosives.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources + [
    {
      title: 'Huge Explosion',
      url: 'https://freesound.org/people/florianreichelt/sounds/459973/',
      author: 'florianreichelt',
      licence: 'CC0-1.0',
      download: '459973__florianreichelt__huge-explosion.mp3',
      files: ['assets/audio/grenade-blast-01.ogg', 'assets/audio/grenade-blast-02.ogg'],
      changes: 'The two blasts with their tails, 6.22–7.92 s and 8.18–10.45 s; the quiet lead-in and the late rumble are left out. Equal L+R downmix, mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade.',
    },
  ],
}
