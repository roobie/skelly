local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.melee-classes',
  tier='core',
  content=['damage-kinds', 'melee-classes', 'melee-sounds'],
  assets=assets,
  json=['assets/manifest.json'],
)
