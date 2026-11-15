local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.household-electrical',
  tier='theme',
  content=['household-electrical-furniture'],
  dependencies=['skelly.electric-power', 'skelly.materials', 'skelly.natural-world'],
)
