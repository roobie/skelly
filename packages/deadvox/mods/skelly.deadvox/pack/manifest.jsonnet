local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox',
  tier='product',
  product=true,
  defaultStart='gauntlet',
  dependencies=['skelly.deadvox.residual'],
)
