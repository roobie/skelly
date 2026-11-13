local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.flame-tools',
  tier='theme',
  content=['flame-tools-items'],
  dependencies=['skelly.fuel', 'skelly.hand-tools', 'skelly.inventory', 'skelly.natural-world'],
)
