local manifest = import '../../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
// The Deadvox wiring of the magic pack, which Deadvox never ships on its own (`packages/deadvox/docs/magic-mod.md`,
// "Why a mod, and which products use it"). Depending on both is what lets it settle their clashes. The ring's row in
// the `desk` loot table is a patch on another pack's table, so it joins this pack's content with the first cut of
// field patches (`packages/deadvox/docs/magic-mod.md`, "Field patches in two cuts").
manifest(
  id='skelly.deadvox.magic',
  tier='product',
  optIn=true,
  content=['item-economy'],
  dependencies=['skelly.deadvox', 'skelly.deadvox.loot', 'skelly.magic'],
)
