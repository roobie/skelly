local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local layout = (import '../../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local scenario = 'skelly.deadvox.scenario.test-house';
manifest(
  id='skelly.deadvox.scenario.test-house.debug',
  tier='scenario',
  optIn=true,
  content=['layouts', 'catalogue'],
  dependencies=[
    scenario, 'skelly.basic-recipes', 'skelly.containers', 'skelly.deadvox.buildings', 'skelly.electric-power',
    'skelly.electronics', 'skelly.firearms', 'skelly.flame-tools', 'skelly.fuel', 'skelly.ground-vehicles',
    'skelly.hand-tools', 'skelly.light-sources', 'skelly.manuals', 'skelly.manufactured-blocks', 'skelly.materials',
    'skelly.melee', 'skelly.readables', 'skelly.structures', 'skelly.wearables', 'skelly.weathering',
    'skelly.deadvox.camp', 'skelly.deadvox.crisis-hq', 'skelly.deadvox.labs.underground', 'skelly.deadvox.rural-sites',
    'skelly.deadvox.woods', 'skelly.household-electrical', 'skelly.natural-world',
  ],
  overrides=[{ pack: scenario, entry: 'layouts:' + layout.id }],
)
