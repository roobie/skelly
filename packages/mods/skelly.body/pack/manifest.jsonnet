local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.jsonnet';
manifest(
  id='skelly.body',
  tier='core',
  content=['body', 'body-sounds', 'body-synth-sounds', 'figures-body', 'figures-player', 'models-body', 'player'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.melee-classes', 'skelly.inventory'],
)
