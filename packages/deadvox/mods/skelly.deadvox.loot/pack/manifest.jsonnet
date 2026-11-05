local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.loot',
  tier='product',
  content=['gauntlet-medical', 'loot-armoury', 'loot-workshop', 'loot'],
  dependencies=[
    'skelly.basic-foods', 'skelly.basic-recipes', 'skelly.containers', 'skelly.electric-power', 'skelly.electronics',
    'skelly.firearms', 'skelly.fuel', 'skelly.hand-tools', 'skelly.light-sources', 'skelly.manuals',
    'skelly.materials', 'skelly.medicine', 'skelly.melee', 'skelly.packaged-foods', 'skelly.readables',
    'skelly.structures', 'skelly.wearables',
  ],
)
