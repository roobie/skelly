local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local content = [
  'benchmark-city', 'camp', 'combat-policy',
  'crisis-hq-fixtures', 'crisis-hq', 'footstep-sounds', 'furniture-cabins',
  'furniture-hunting', 'furniture-playtest', 'furniture', 'gauntlet-look', 'gauntlet-start',
  'gauntlet', 'hunting-cabins', 'item-economy', 'items-other', 'items-playtest',
  'ladders', 'layouts-cabins', 'layouts-playtest', 'layouts-stairs',
  'layouts-test-house', 'layouts-voice-size', 'layouts-water', 'layouts', 'locks',
  'loot-workshop', 'loot', 'map-kits', 'models-items',
  'rural-medical-fixtures', 'rural-medical', 'rural-police-fixtures', 'rural-police',
  'rural-substation-fixtures', 'rural-substation', 'scenarios',
  'site-generation', 'starts', 'sounds', 'templates-cabins', 'templates-medical',
  'templates-playtest', 'templates-stairs', 'templates-test-house', 'templates-workshop',
  'templates', 'tutorial', 'enemies',
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
    'skelly.firearms', 'skelly.manuals',
  ],
  content=content,
  things=things,
  assets=assets,
  json=[
    'things/index.json', 'assets/manifest.json', 'exports/things.json', 'presentation/item-materials.json',
  ],
)
