{
  itemWear: [{ id: 'fixture_lamp', bands: [{ from: 0, tints: { metal: { color: '#ffffff', mix: 0 } } }] }],
  models: [{
    id: 'lamp',
    file: 'assets/models/lamp.glb',
    grip: { at: [0.05, 0.05, 0.05] },
    anchors: { lens: [0.3, 0.05, 0.05] },
    itemPresentation: { wear: 'fixture_lamp', materials: ['metal'], supply: { kind: 'none' } },
  }],
  items: [{
    id: 'lamp',
    economy: { usage: [], tiers: [] },
    workInProgress: false,
    notLoot: false,
    name: 'Lamp',
    category: 'light',
    weight: 400,
    size: [3, 1],
    model: 'lamp',
  }],
}
