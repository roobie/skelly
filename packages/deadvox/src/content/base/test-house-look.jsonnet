{
  mapPieces: [{
    id: 'test_house_look',
    style: 'concrete_townhouse',
    size: [10, 3, 5],
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    anchors: { spawn: { at: [1, 0, 4], kind: 'point' } },
    ports: [],
    palette: {
      '.': { role: 'opening', material: 'opening' },
      B: { furniture: 'battery_charger' },
      G: { furniture: 'gauntlet_lab_generator' },
      C: { furniture: 'crate', items: [
        { item: 'rechargeable_aa_battery', count: 1, charge: 0.25, placement: 'surface' },
        { item: 'flashlight', count: 1, charge: 0, placement: 'surface' },
      ] },
    },
    layers: [
      ['......GGGG', 'CC....GGGG', 'CCB...GGGG', '..........', '..........'],
      ['......GGGG', 'CC....GGGG', 'CC....GGGG', '..........', '..........'],
      ['......GGGG', '......GGGG', '......GGGG', '..........', '..........'],
    ],
    ownership: { layers: [
      ['......SSSS', 'SS....SSSS', 'SSS...SSSS', '..........', '..........'],
      ['......SSSS', 'SS....SSSS', 'SS....SSSS', '..........', '..........'],
      ['......SSSS', '......SSSS', '......SSSS', '..........', '..........'],
    ] },
  }],
}
