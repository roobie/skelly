local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.labs.underground',
  tier='product',
  content=['furniture'],
  dependencies=['skelly.electric-power', 'skelly.natural-world'],
)
