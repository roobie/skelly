local severed = import 'tools/jsonnet/lib/severed-parts.libsonnet';
// Models the body pack declares for any product: its player figure, the flesh chunks gore leaves and every severed part.
local ownedModels = ['flesh_chunk_small', 'flesh_chunk_medium', 'flesh_chunk_large', 'flesh_chunk_strip'] + severed.ids;

(import 'tools/jsonnet/lib/item-presentation.libsonnet')(import 'presentation/item-materials.json').pack({
  models: (import 'tools/jsonnet/lib/used-models.libsonnet')(
    (import 'packages/skelly-assets/built/skelly.body/things/index.json') + severed.models,
    [import 'figures-player.jsonnet', { models: ownedModels }],
  ),
})
