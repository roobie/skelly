local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.firearms',
  tier='theme',
  content=[
    'firearms-skills', 'ranged-tuning', 'items-ammunition', 'items-attachments', 'items-gun-parts',
    'items-pistol', 'items-revolver', 'firearms-items', 'models-attachments', 'models-firearm-things', 'models-firearms',
    'models-gun-parts', 'sounds-firearms', 'sounds-pump', 'sounds-revolver', 'sounds-weapons',
  ],
  assets=assets,
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.crafting', 'skelly.electric-power', 'skelly.hand-tools', 'skelly.inventory',
    'skelly.materials', 'skelly.melee', 'skelly.melee-classes', 'skelly.natural-world', 'skelly.structures',
  ],
)
