local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.voice-size',
  tier='scenario',
  content=['layouts-voice-size', 'starts'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.actors', 'skelly.light-sources', 'skelly.medicine', 'skelly.melee',
    'skelly.packaged-foods', 'skelly.wearables',
  ],
)
