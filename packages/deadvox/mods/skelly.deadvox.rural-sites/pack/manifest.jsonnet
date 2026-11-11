local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.rural-sites',
  tier='product',
  content=[
    'furniture-medical', 'item-economy', 'rural-medical-fixtures', 'rural-medical',
    'rural-police-fixtures', 'rural-police', 'rural-substation-fixtures', 'rural-substation', 'templates-medical',
  ],
  dependencies=[
    'skelly.body', 'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.buildings', 'skelly.deadvox.loot',
    'skelly.deadvox.site-generation', 'skelly.household-electrical', 'skelly.inventory', 'skelly.keys',
    'skelly.manufactured-blocks', 'skelly.natural-world', 'skelly.structures',
  ],
)
