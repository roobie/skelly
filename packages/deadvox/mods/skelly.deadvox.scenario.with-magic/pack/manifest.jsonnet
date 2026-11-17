local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Deadvox with the magic pack turned on, picked through `?mods=`; the run starts where the product's default start
// puts it, so this pack names no start of its own.
manifest(
  id='skelly.deadvox.scenario.with-magic',
  tier='scenario',
  optIn=true,
  dependencies=['skelly.deadvox', 'skelly.deadvox.magic'],
)
