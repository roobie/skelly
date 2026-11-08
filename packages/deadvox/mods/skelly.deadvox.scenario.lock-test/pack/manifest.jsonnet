local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.scenario.lock-test',
  tier='scenario',
  content=['item-economy', 'locks', 'models-lock-test', 'starts'],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.deadvox.site-generation', 'skelly.inventory', 'skelly.light-sources', 'skelly.manufactured-blocks',
    'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.structures',
    'skelly.wearables',
  ],
)
