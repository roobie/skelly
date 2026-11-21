local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.packaged-foods',
  tier='theme',
  content=['packaged-foods-items'],
  dependencies=['skelly.basic-foods', 'skelly.hand-tools', 'skelly.inventory'],
)
