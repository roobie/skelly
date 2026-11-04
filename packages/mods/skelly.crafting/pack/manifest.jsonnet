local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.crafting',
  tier='theme',
  content=['crafting'],
  dependencies=['skelly.progression'],
)
