(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'jerry_can',
      name: 'Jerry can',
      category: 'misc',
      model: 'jerry_can',
      size: [4, 5],
      description: 'A fuel-filled can.',
      vessel: {
        capacityMicrolitres: 20000000,
        pour: { incrementMicrolitres: 100000, microlitresPerSimSecond: 100000 },
        accepts: 'any',
        initialContents: { kind: 'filled', liquid: 'gasoline', volumeMicrolitres: 20000000 },
      },
    },
    {
      id: 'lamp_oil',
      name: 'Oil bottle',
      category: 'material',
      weight: 100,
      size: [1, 2],
      description: 'A small bottle for lamp oil.',
      model: 'lamp_oil_bottle',
      vessel: {
        capacityMicrolitres: 500000,
        pour: { incrementMicrolitres: 10000, microlitresPerSimSecond: 50000 },
        accepts: ['lamp_fuel'],
        initialContents: { kind: 'filled', liquid: 'lamp_fuel', volumeMicrolitres: 500000 },
      },
    },
  ],
})
