local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.body',
  tier='core',
  content=['body', 'body-sounds', 'body-synth-sounds', 'figures-player', 'models-body', 'player'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=['skelly.melee-classes', 'skelly.inventory'],
)
