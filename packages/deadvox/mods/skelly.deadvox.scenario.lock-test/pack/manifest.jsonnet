local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.scenario.lock-test',
  tier='scenario',
  content=['item-economy', 'locks', 'models-lock-test', 'starts'],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.inventory', 'skelly.light-sources', 'skelly.manufactured-blocks',
    'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.structures',
    'skelly.wearables',
  ],
)
