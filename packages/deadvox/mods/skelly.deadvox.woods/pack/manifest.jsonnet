local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.woods',
  tier='product',
  content=['furniture', 'templates'],
  dependencies=['skelly.building-blocks', 'skelly.deadvox.loot', 'skelly.manufactured-blocks', 'skelly.natural-world', 'skelly.structures'],
)
