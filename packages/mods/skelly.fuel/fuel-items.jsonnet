(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  liquids: [
    { id: 'lamp_fuel', name: 'Lamp oil', densityGramsPerMillilitre: 0.8 },
    { id: 'gasoline', name: 'Gasoline', densityGramsPerMillilitre: 0.755 },
  ],
  items: [
    {
      id: 'gas_canister',
      name: 'Gas cartridge',
      category: 'misc',
      model: 'gas_canister',
      size: [1, 2],
      stack: 2,
      description: 'Fuel for a blowtorch.',
      canister: { capacity: 3 },
    },
  ],
})
