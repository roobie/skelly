(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
).pack({
  models: [
    if model.id == 'frag_grenade' then model + {
      lever: { piece: 'lever', launchMetresPerRealSecond: 3, spinDegreesPerRealSecond: 1080, lifetimeRealSeconds: 1.5 },
      pin: { piece: 'pin' },
    } else model
    for model in (import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.explosives/things/index.json', [import 'explosives-items.jsonnet'])
  ],
})
