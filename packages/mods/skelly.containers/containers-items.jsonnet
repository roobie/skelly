// The worn bag models are authored in the bust's frame, so they sit on the torso frame as drawn.
local onTorso(model) = [{ model: model, overTorso: { jacket: model + '_jacket' }, frame: 'torso', pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0] }];
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
    {
      id: 'fanny_pack',
      name: 'Fanny pack',
      category: 'bag',
      model: 'fanny_pack',
      figureModels: onTorso('fanny_pack_worn'),
      size: [2, 2],
      wearable: { slot: 'waist', encumbrance: 3 },
      container: { takeSound: 'pouch_take', pockets: [{ grid: [3, 2], handlingSimSeconds: 0.8 }] },
    },
    {
      id: 'school_backpack',
      name: 'School backpack',
      category: 'bag',
      model: 'school_backpack',
      figureModels: onTorso('school_backpack_worn'),
      size: [4, 4],
      wearable: { slot: 'back', encumbrance: 10 },
      container: {
        takeSound: 'pouch_take',
        pockets: [
          { name: 'main', grid: [5, 6], handlingSimSeconds: 1.5 },
          { name: 'front', grid: [3, 2], handlingSimSeconds: 1.2 },
        ],
      },
    },
    {
      id: 'hiking_backpack',
      name: 'Hiking backpack',
      category: 'bag',
      model: 'hiking_backpack',
      figureModels: onTorso('hiking_backpack_worn'),
      size: [4, 5],
      wearable: { slot: 'back', encumbrance: 12 },
      container: {
        pockets: [
          { name: 'main', grid: [6, 8], handlingSimSeconds: 1.5 },
          { name: 'lid', grid: [3, 2], handlingSimSeconds: 1.0 },
        ],
      },
    },
  ],
})
