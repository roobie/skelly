(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'blowtorch',
      name: 'Blowtorch',
      category: 'tool',
      model: 'blowtorch',
      size: [2, 3],
      description: 'A gas torch that cuts steel. It runs on a gas cartridge.',
      tool: { qualities: { flame_cutting: 1 }, fuel: { canister: 'gas_canister', swapSimSeconds: 3 } },
    },
  ],
})
