(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'hinge_set',
      name: 'Small hinge set',
      category: 'material',
      size: [2, 1],
      model: 'hinge_set',
      salvageTimeGameMinutes: 5,
      salvage: [{ item: 'scrap_metal', count: 1 }, { item: 'fastener_pack', count: 1 }],
    },
  ],
})
