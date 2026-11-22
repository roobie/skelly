local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.electric-power',
  tier='theme',
  content=['electric-power-items', 'electric-power-furniture', 'electric-power-sounds', 'power', 'thermal-plant', 'models-electric-power'],
  assets=import '../assets/manifest.jsonnet',
  json=['assets/manifest.json', 'presentation/item-materials.json'],
  dependencies=['skelly.body', 'skelly.crafting', 'skelly.electronics', 'skelly.inventory', 'skelly.light-sources', 'skelly.materials', 'skelly.natural-world'],
)
