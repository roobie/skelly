local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.camp',
  tier='product',
  content=['camp', 'item-economy'],
  dependencies=[
    'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.loot', 'skelly.firearms', 'skelly.inventory',
    'skelly.keys', 'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.natural-world', 'skelly.packaged-foods',
    'skelly.readables', 'skelly.structures',
  ],
)
