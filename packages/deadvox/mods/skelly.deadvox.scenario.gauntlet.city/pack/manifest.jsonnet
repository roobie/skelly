local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.gauntlet.city',
  tier='scenario',
  content=['footstep-sounds', 'gauntlet', 'gauntlet-look', 'item-economy', 'scenarios'],
  dependencies=[
    'skelly.basic-foods', 'skelly.body', 'skelly.crafting', 'skelly.deadvox.actors', 'skelly.deadvox.buildings',
    'skelly.deadvox.camp', 'skelly.deadvox.crisis-hq', 'skelly.deadvox.labs.underground', 'skelly.deadvox.loot',
    'skelly.deadvox.rural-sites', 'skelly.deadvox.site-generation', 'skelly.electric-power', 'skelly.electronics',
    'skelly.firearms', 'skelly.flame-tools', 'skelly.fuel', 'skelly.hand-tools', 'skelly.household-electrical',
    'skelly.inventory', 'skelly.keys', 'skelly.light-sources', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.medicine', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.readables', 'skelly.structures',
    'skelly.wearables',
  ],
)
