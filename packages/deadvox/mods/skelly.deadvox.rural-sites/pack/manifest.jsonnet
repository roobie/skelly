local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.rural-sites',
  tier='product',
  content=[
    'furniture-medical', 'item-economy', 'models-rural-sites', 'rural-medical-fixtures', 'rural-medical',
    'rural-police-fixtures', 'rural-police', 'rural-substation-fixtures', 'rural-substation', 'templates-medical',
  ],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.body', 'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.buildings', 'skelly.deadvox.loot',
    'skelly.deadvox.site-generation', 'skelly.household-electrical', 'skelly.inventory', 'skelly.manufactured-blocks', 'skelly.natural-world',
    'skelly.structures',
  ],
)
