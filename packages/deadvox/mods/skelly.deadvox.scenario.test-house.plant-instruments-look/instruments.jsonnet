local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local policy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local look = import 'packages/mods/skelly.electric-power/plant-instruments.libsonnet';
local instrument = look([
  { slot: 'control', name: 'Control', label: 'CONTROL', x: 0.85 },
  { slot: 'coupling', name: 'Coupling', label: 'COUPLING', x: 0.15 },
]);
local states = [
  { id: 'fresh', name: 'Fresh spare', condition: 1 },
  { id: 'worn', name: 'Worn module', condition: 0.7 },
  { id: 'badly_damaged', name: 'Badly damaged running module', condition: 0.2 },
  { id: 'failed', name: 'Failed part', condition: 0.1, critical: true },
  { id: 'off', name: 'Switched off module', condition: 1, enabled: false },
  { id: 'empty', name: 'Out of fuel module', condition: 1, device: 'instrument_fixture_generator' },
  { id: 'ruined', name: 'Ruined housing', condition: 1 },
];
local id(state) = 'instrument_fixture_' + state.id;
local instant = { timeGameMinutes: 0 };
breach.breaking(policy.itemPack({
  items: [
    { id: 'instrument_fixture_control', name: 'Control unit', category: 'material', size: [1, 1], weight: 200 },
    { id: 'instrument_fixture_coupling', name: 'Coupling', category: 'material', size: [1, 1], weight: 200 },
  ],
  powerDevices: [
    { id: 'instrument_fixture_source', kind: 'inexhaustible', priority: 0, outputWatts: 100 },
    { id: 'instrument_fixture_generator', kind: 'generator', priority: 0, outputWatts: 100, burnLitresPerGameHour: 1 },
  ],
  partBlueprints: [
    {
      id: id(state),
      slots: [
        { id: 'control', accepts: ['instrument_fixture_control', 'instrument_fixture_coupling'], initial: { item: 'instrument_fixture_control', condition: [state.condition, state.condition] }, service: instant },
        { id: 'coupling', accepts: ['instrument_fixture_coupling'], initial: { item: 'instrument_fixture_coupling', condition: [1, 1] }, service: instant },
      ],
    }
    for state in states
  ],
  furniture: [
    {
      id: id(state), name: state.name, size: [2, 4, 2], color: '#29483f', material: 'steel',
      takeApart: { parts: id(state) },
      power: {
        device: if std.objectHas(state, 'device') then state.device else 'instrument_fixture_source',
        fuelLitres: 0,
        enabled: if std.objectHas(state, 'enabled') then state.enabled else true,
        instruments: instrument,
        requires: [
          { slot: 'control', parts: ['instrument_fixture_control'], minimum: 0.15 } + (if std.objectHas(state, 'critical') then { critical: true } else {}),
          { slot: 'coupling', parts: ['instrument_fixture_coupling'] },
        ],
      },
    }
    for state in states
  ],
}))
