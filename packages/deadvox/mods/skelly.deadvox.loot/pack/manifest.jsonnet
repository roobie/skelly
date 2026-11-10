local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.loot',
  tier='product',
  content=['medical-stock', 'item-economy', 'loot-armoury', 'loot-workshop', 'loot-policy', 'loot'],
  dependencies=[
    'skelly.basic-foods', 'skelly.basic-recipes', 'skelly.containers', 'skelly.electric-power', 'skelly.electronics',
    'skelly.explosives', 'skelly.firearms', 'skelly.flame-tools', 'skelly.fuel', 'skelly.ground-vehicles',
    'skelly.hand-tools', 'skelly.inventory', 'skelly.light-sources', 'skelly.manuals', 'skelly.materials',
    'skelly.medicine', 'skelly.melee', 'skelly.packaged-foods', 'skelly.readables', 'skelly.structures',
    'skelly.traps', 'skelly.wearables',
  ],
)
