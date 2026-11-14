local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
local assets = import '../assets/manifest.json';
manifest(
  id='skelly.natural-world',
  tier='core',
  content=['block-materials', 'natural-blocks', 'vegetation', 'furniture-materials', 'natural-sounds', 'sounds-furniture'],
  assets=assets,
  json=['assets/manifest.json'],
  dependencies=['skelly.materials', 'skelly.melee-classes', 'skelly.sound-families'],
)
