local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.roads',
  tier='product',
  optIn=true,
  content=['roads'],
  dependencies=['skelly.building-blocks', 'skelly.manufactured-blocks', 'skelly.natural-world'],
)
