local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// Opt-in because magic is outside some products' tone; a product brings it in through a compatibility pack
// (`packages/deadvox/docs/magic-mod.md`, "Why a mod, and which products use it").
manifest(
  id='skelly.magic',
  tier='theme',
  optIn=true,
  content=['magic-items', 'magic-pools', 'magic-spells'],
  dependencies=['skelly.arcana', 'skelly.attributes', 'skelly.melee-classes'],
)
