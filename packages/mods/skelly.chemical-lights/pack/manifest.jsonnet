local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.chemical-lights',
  tier='theme',
  content=['chemical-lights-items'],
  dependencies=['skelly.inventory', 'skelly.light-sources'],
)
