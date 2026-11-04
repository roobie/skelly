local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox',
  tier='product',
  product=true,
  defaultStart='gauntlet',
  dependencies=[
    'skelly.saves', 'skelly.day-cycle', 'skelly.controls', 'skelly.graphics', 'skelly.ui',
    'skelly.weathering', 'skelly.deadvox.weathering', 'skelly.melee-classes', 'skelly.inventory', 'skelly.body',
    'skelly.sound-families', 'skelly.senses', 'skelly.natural-world', 'skelly.materials', 'skelly.medicine',
    'skelly.hand-tools', 'skelly.readables', 'skelly.structures', 'skelly.deadvox.residual',
  ],
)
