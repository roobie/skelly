local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// The Deadvox wiring of the magic pack, which Deadvox never ships on its own (`packages/deadvox/docs/magic-mod.md`,
// "Why a mod, and which products use it"). Depending on both is what lets it settle their clashes, and lets it patch
// the loot pack's tables.
manifest(
  id='skelly.deadvox.magic',
  tier='product',
  optIn=true,
  content=['item-economy', 'loot'],
  dependencies=['skelly.deadvox', 'skelly.deadvox.loot', 'skelly.magic'],
)
