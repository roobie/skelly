local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.combat-policy',
  tier='product',
  content=['combat-policy'],
  dependencies=[],
)
