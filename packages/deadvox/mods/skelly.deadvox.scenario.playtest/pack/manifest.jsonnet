local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.scenario.playtest',
  tier='scenario',
  content=[
    'furniture-playtest', 'item-economy', 'items-playtest', 'ladders', 'layouts-playtest', 'models-playtest', 'starts',
    'templates-playtest',
  ],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.containers', 'skelly.day-cycle', 'skelly.deadvox.actors', 'skelly.deadvox.buildings',
    'skelly.deadvox.camp', 'skelly.deadvox.loot', 'skelly.deadvox.rural-sites',
    'skelly.deadvox.site-generation', 'skelly.deadvox.woods',
    'skelly.electric-power', 'skelly.explosives', 'skelly.firearms', 'skelly.hand-tools', 'skelly.household-electrical',
    'skelly.inventory', 'skelly.light-sources', 'skelly.manuals', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.readables',
    'skelly.structures', 'skelly.wearables',
  ],
)
