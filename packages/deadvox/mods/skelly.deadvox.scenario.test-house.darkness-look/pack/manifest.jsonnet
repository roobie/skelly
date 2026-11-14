local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.deadvox.scenario.test-house.darkness-look',
  tier='scenario',
  optIn=true,
  content=['layouts', 'starts'],
  dependencies=[
    'skelly.deadvox.scenario.test-house', 'skelly.deadvox.actors', 'skelly.basic-recipes', 'skelly.deadvox.labs.underground',
    'skelly.flame-tools', 'skelly.household-electrical', 'skelly.manufactured-blocks', 'skelly.medicine', 'skelly.melee',
    'skelly.packaged-foods', 'skelly.structures', 'skelly.wearables',
  ],
)
