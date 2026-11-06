local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local layout = (import '../../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local scenario = 'skelly.deadvox.scenario.test-house';
manifest(
  id='skelly.deadvox.scenario.test-house.debug',
  tier='scenario',
  optIn=true,
  content=['layouts'],
  dependencies=[
    scenario, 'skelly.basic-recipes', 'skelly.containers', 'skelly.deadvox.buildings', 'skelly.electric-power',
    'skelly.electronics', 'skelly.firearms', 'skelly.flame-tools', 'skelly.fuel', 'skelly.ground-vehicles',
    'skelly.hand-tools', 'skelly.light-sources', 'skelly.manuals', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.melee', 'skelly.readables', 'skelly.structures', 'skelly.wearables', 'skelly.weathering',
  ],
  overrides=[{ pack: scenario, entry: 'layouts:' + layout.id }],
)
