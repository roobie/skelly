local source = import 'wearables-items.libsonnet';
(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack(source {
  items: [
    item + (if std.objectHas(item, 'container') then { container+: { takeSound: 'pouch_take' } } else {})
    for item in source.items
  ],
})
