local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox',
  tier='product',
  product=true,
  defaultStart='gauntlet',
  dependencies=[
    'skelly.saves', 'skelly.day-cycle', 'skelly.controls', 'skelly.graphics', 'skelly.ui',
    'skelly.weathering', 'skelly.deadvox.weathering', 'skelly.deadvox.residual',
  ],
)
