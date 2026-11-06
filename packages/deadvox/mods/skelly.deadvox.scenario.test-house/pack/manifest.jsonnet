local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house',
  tier='scenario',
  content=['layouts-test-house', 'starts', 'templates-test-house'],
  dependencies=[
    'skelly.basic-recipes', 'skelly.containers', 'skelly.deadvox.labs.underground', 'skelly.electric-power',
    'skelly.electronics', 'skelly.firearms', 'skelly.fuel', 'skelly.ground-vehicles', 'skelly.hand-tools',
    'skelly.household-electrical', 'skelly.light-sources', 'skelly.manuals', 'skelly.manufactured-blocks',
    'skelly.materials', 'skelly.medicine', 'skelly.melee', 'skelly.natural-world', 'skelly.packaged-foods',
    'skelly.readables', 'skelly.structures', 'skelly.wearables', 'skelly.weathering',
  ],
)
