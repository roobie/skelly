local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local kit = import '../../../../../tools/jsonnet/lib/start-kit.libsonnet';
local layout = (import '../../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local scenario = 'skelly.deadvox.scenario.test-house';
manifest(
  id='skelly.deadvox.scenario.test-house.debug',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts', 'vehicles-look'],
  dependencies=kit.dependencies([
    scenario, 'skelly.containers', 'skelly.deadvox.buildings', 'skelly.deadvox.site-generation',
    'skelly.electric-power', 'skelly.electronics', 'skelly.firearms', 'skelly.flame-tools', 'skelly.fuel',
    'skelly.ground-vehicles', 'skelly.manuals', 'skelly.manufactured-blocks', 'skelly.materials', 'skelly.readables',
    'skelly.structures', 'skelly.weathering',
  ]),
  overrides=[{ pack: scenario, entry: 'layouts:' + layout.id }],
)
