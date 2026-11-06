local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local content = [
  'footstep-sounds',
  'furniture-playtest', 'gauntlet-look', 'gauntlet-start',
  'gauntlet', 'item-economy', 'items-playtest',
  'ladders', 'layouts-playtest',
  'layouts-test-house',
  'models-items', 'scenarios',
  'starts',
  'templates-playtest', 'templates-test-house', 'tutorial',
];
local things = import '../things/index.json';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.deadvox.residual',
  tier='product',
  dependencies=[
    'skelly.saves', 'skelly.day-cycle', 'skelly.controls', 'skelly.graphics', 'skelly.ui',
    'skelly.weathering', 'skelly.deadvox.weathering', 'skelly.melee-classes', 'skelly.inventory', 'skelly.body',
    'skelly.sound-families', 'skelly.senses', 'skelly.natural-world', 'skelly.materials', 'skelly.medicine',
    'skelly.hand-tools', 'skelly.readables', 'skelly.structures', 'skelly.basic-foods', 'skelly.packaged-foods',
    'skelly.wearables', 'skelly.progression', 'skelly.crafting', 'skelly.manufactured-blocks',
    'skelly.fuel', 'skelly.containers', 'skelly.flame-tools', 'skelly.light-sources',
    'skelly.basic-recipes', 'skelly.melee', 'skelly.traps', 'skelly.explosives',
    'skelly.electronics', 'skelly.electric-power', 'skelly.household-electrical', 'skelly.ground-vehicles',
    'skelly.firearms', 'skelly.manuals', 'skelly.deadvox.site-generation', 'skelly.deadvox.combat-policy',
    'skelly.deadvox.loot', 'skelly.deadvox.actors', 'skelly.deadvox.buildings', 'skelly.deadvox.camp',
    'skelly.deadvox.rural-sites', 'skelly.deadvox.crisis-hq', 'skelly.deadvox.woods',
    'skelly.deadvox.labs.underground',
  ],
  content=content,
  things=things,
  assets=assets,
  json=[
    'things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json',
  ],
)
