local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.buildings',
  tier='product',
  content=[
    'buildings-sounds', 'furniture-hunting', 'furniture-workshop', 'furniture', 'map-kits', 'templates-workshop',
    'templates',
  ],
  assets=assets,
  json=['assets/manifest.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.body', 'skelly.deadvox.actors', 'skelly.deadvox.loot',
    'skelly.household-electrical', 'skelly.manufactured-blocks', 'skelly.natural-world', 'skelly.structures',
  ],
)
