local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.electric-power',
  tier='theme',
  content=['electric-power-items', 'electric-power-furniture', 'power', 'thermal-plant'],
  dependencies=['skelly.body', 'skelly.crafting', 'skelly.electronics', 'skelly.inventory', 'skelly.light-sources', 'skelly.materials', 'skelly.natural-world'],
)
