local source = import 'items-wearables.libsonnet';
(import 'economy.libsonnet').pack(source {
  items: [
    item + (if std.objectHas(item, 'container') then { container+: { takeSound: 'pouch_take' } } else {})
    for item in source.items
  ],
})
