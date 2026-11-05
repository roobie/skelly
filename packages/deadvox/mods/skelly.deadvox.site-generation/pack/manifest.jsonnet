local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.site-generation',
  tier='product',
  content=['site-generation'],
  dependencies=['skelly.natural-world', 'skelly.manufactured-blocks'],
)
