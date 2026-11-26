(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'blowtorch',
      name: 'Blowtorch',
      category: 'tool',
      model: 'blowtorch',
      size: [2, 3],
      description: 'A gas torch that cuts steel. It runs on a gas cartridge.',
      tool: {
        qualities: { flame_cutting: 1 },
        // Heat past metal's resistance clears its minimum strength, so steel cuts; a joist takes over a minute, and a
        // cartridge lasts a couple of joists.
        cut: { strength: 12, damageKind: 'heat', strikeIntervalSimSeconds: 2, strikeSound: 'torch_cut' },
        fuel: { canister: 'gas_canister', swapSimSeconds: 3, fillPerSimSecond: 0.015 },
      },
    },
  ],
})
