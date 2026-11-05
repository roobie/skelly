local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox',
  tier='product',
  product=true,
  defaultStart='gauntlet',
  dependencies=[
    'skelly.saves', 'skelly.day-cycle', 'skelly.controls', 'skelly.graphics', 'skelly.ui',
    'skelly.weathering', 'skelly.deadvox.weathering', 'skelly.melee-classes', 'skelly.inventory', 'skelly.body',
    'skelly.sound-families', 'skelly.senses', 'skelly.natural-world', 'skelly.materials', 'skelly.medicine',
    'skelly.hand-tools', 'skelly.readables', 'skelly.structures', 'skelly.basic-foods', 'skelly.packaged-foods',
    'skelly.wearables', 'skelly.progression', 'skelly.crafting', 'skelly.manufactured-blocks',
    'skelly.fuel', 'skelly.containers', 'skelly.flame-tools', 'skelly.light-sources',
    'skelly.basic-recipes', 'skelly.melee', 'skelly.traps', 'skelly.explosives',
    'skelly.electronics', 'skelly.electric-power', 'skelly.household-electrical', 'skelly.ground-vehicles',
    'skelly.firearms', 'skelly.manuals', 'skelly.deadvox.residual',
  ],
)
