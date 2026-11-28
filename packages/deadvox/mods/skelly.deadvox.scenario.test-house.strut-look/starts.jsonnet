local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local cylinder = (import 'packages/skelly-assets/built/skelly.firearms/gungen/revolver.model.json').gun.revolver;
{
  starts: [kit.fixture + {
    id: 'strutlook',
    site: 'testHouseStrutLook',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
    kit+: [
      {
        id: 'revolver', item: 'revolver_357', condition: 1,
        cylinder: { chambers: std.repeat([{ state: 'round', roundType: 'cartridge_357_h_magnum' }], cylinder.chambers), aligned: 0, open: false, cocked: false },
        destination: { kind: 'hand', role: 'dominant' },
      },
      { id: 'rounds', item: 'cartridge_357_h_magnum', count: 50, destination: { kind: 'pocket', parent: 'jeans', pocket: 1 } },
      { id: 'cutter', item: 'blowtorch', condition: 1, destination: { kind: 'hand', role: 'off' } },
      { id: 'fuel', item: 'gas_canister', destination: { kind: 'slot', parent: 'cutter', slot: 'canister' } },
    ],
  }],
}
