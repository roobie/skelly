local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local base = 'skelly.day-cycle';
manifest(
  id='skelly.day-cycle.winter',
  tier='core',
  optIn=true,
  content=['dayCycle'],
  dependencies=[base],
  overrides=[{ pack: base, entry: 'dayCycle:dayCycle' }],
)
