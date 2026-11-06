local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.scenario.playtest',
  tier='scenario',
  content=[
    'furniture-playtest', 'item-economy', 'items-playtest', 'ladders', 'layouts-playtest', 'models-playtest', 'starts',
    'templates-playtest',
  ],
  things=things,
  assets=assets,
  json=['things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.containers', 'skelly.day-cycle', 'skelly.deadvox.actors', 'skelly.deadvox.buildings',
    'skelly.deadvox.camp', 'skelly.deadvox.loot', 'skelly.deadvox.rural-sites', 'skelly.deadvox.woods',
    'skelly.electric-power', 'skelly.explosives', 'skelly.firearms', 'skelly.hand-tools', 'skelly.household-electrical',
    'skelly.inventory', 'skelly.light-sources', 'skelly.manuals', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods', 'skelly.readables',
    'skelly.structures', 'skelly.wearables',
  ],
)
