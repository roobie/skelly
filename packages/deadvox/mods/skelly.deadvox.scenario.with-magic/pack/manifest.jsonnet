local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Deadvox with the magic pack turned on, picked through `?mods=`; the run starts where the product's default start
// puts it, and this pack's patch hands that start the wand, the spell and its mana. Depending on the product is what
// lets the patch reach the start.
manifest(
  id='skelly.deadvox.scenario.with-magic',
  tier='scenario',
  optIn=true,
  content=['start-grants'],
  dependencies=['skelly.deadvox', 'skelly.deadvox.magic'],
)
