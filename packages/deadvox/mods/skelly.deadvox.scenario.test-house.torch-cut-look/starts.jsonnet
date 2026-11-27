local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Torch cuts by eye: the tester stands beside a steel joist run carrying a slab, with every skill at its top level and
// a blowtorch in hand, so the check is cutting the joist end and watching the run fall. The fitted cartridge starts
// nearly empty so the torch runs dry within a few strikes, and the full spare covers the swap and the rest of the cuts.
{
  starts: [kit.fixture + {
    id: 'torchcutlook',
    site: 'testHouseTorchCutLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      { id: 'blowtorch', item: 'blowtorch', condition: 1, destination: { kind: 'hand', role: 'dominant' } },
      {
        id: 'cartridge', item: 'gas_canister', fill: 0.02,
        destination: { kind: 'slot', parent: 'blowtorch', slot: 'canister' },
      },
      { id: 'spare_cartridge', item: 'gas_canister', destination: { kind: 'pocket', parent: 'jeans', pocket: 0 } },
    ],
  }],
}
