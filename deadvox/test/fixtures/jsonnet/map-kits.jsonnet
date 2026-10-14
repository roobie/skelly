local palette = {
  '=': { role: 'support', material: 'floor' },
  '.': { role: 'opening', material: 'air' },
};
local room = {
  id: 'room_a', style: 'fixture_style', size: [4, 5, 4],
  lootContext: { usage: [], tier: 'Tier1' }, palette: palette,
  layers: [
    ['====', '====', '====', '===='],
    ['....', '....', '....', '....'],
    ['....', '....', '....', '....'],
    ['....', '....', '....', '....'],
    ['....', '....', '....', '....'],
  ],
  ownership: { layers: [
    ['SSSS', 'SSSS', 'SSSS', 'SSSS'],
    ['RRRR', 'RRRR', 'RRRR', 'RRRR'],
    ['RRRR', 'RRRR', 'RRRR', 'RRRR'],
    ['RRRR', 'RRRR', 'RRRR', 'RRRR'],
    ['RRRR', 'RRRR', 'RRRR', 'RRRR'],
  ] },
  anchors: {},
  ports: [
    { id: 'west', type: 'corridor', facing: 'w', at: [0, 1, 2], traversal: 'walk', aperture: [2, 4],
      clearance: { min: [0, 1, 1], size: [2, 4, 2] }, standing: [1, 1, 2] },
    { id: 'east', type: 'corridor', facing: 'e', at: [4, 1, 2], traversal: 'walk', aperture: [2, 4],
      clearance: { min: [2, 1, 1], size: [2, 4, 2] }, standing: [3, 1, 2] },
  ],
};
{
  blocks: [
    { id: 'fixture_floor', name: 'Floor', color: '#808080', solid: true },
    { id: 'fixture_other_floor', name: 'Other floor', color: '#808080', solid: true },
  ],
  mapStyles: [
    { id: 'fixture_style', bindings: { floor: { role: 'support', block: 'fixture_floor' }, air: { role: 'opening', block: 'air' } } },
    { id: 'fixture_other', bindings: { floor: { role: 'support', block: 'fixture_other_floor' }, air: { role: 'opening', block: 'air' } } },
  ],
  mapPieces: [
    room,
    room + { id: 'room_b', style: 'fixture_other' },
    {
      id: 'threshold', style: 'fixture_style', size: [2, 5, 4],
      lootContext: { usage: [], tier: 'Tier1' }, palette: palette,
      layers: [
        ['==', '==', '==', '=='],
        ['..', '..', '..', '..'],
        ['..', '..', '..', '..'],
        ['..', '..', '..', '..'],
        ['..', '..', '..', '..'],
      ],
      ownership: { layers: [
        ['SS', 'SS', 'SS', 'SS'],
        ['RR', 'RR', 'RR', 'RR'],
        ['RR', 'RR', 'RR', 'RR'],
        ['RR', 'RR', 'RR', 'RR'],
        ['RR', 'RR', 'RR', 'RR'],
      ] },
      anchors: {},
      ports: [
        { id: 'west', type: 'corridor', facing: 'w', at: [0, 1, 2], traversal: 'walk', aperture: [2, 4],
          clearance: { min: [0, 1, 1], size: [2, 4, 2] }, standing: [1, 1, 2] },
        { id: 'east', type: 'corridor', facing: 'e', at: [2, 1, 2], traversal: 'walk', aperture: [2, 4],
          clearance: { min: [0, 1, 1], size: [2, 4, 2] }, standing: [1, 1, 2] },
      ],
    },
  ],
  mapAssemblies: [
    {
      id: 'fixture_route', size: [10, 5, 4], lootContext: { usage: [], tier: 'Tier1' },
      slots: [
        { id: 'front', at: [0, 0, 0], size: [4, 5, 4], turn: 0, choices: [
          { ref: { kind: 'piece', id: 'room_a' }, weight: 1 },
          { ref: { kind: 'piece', id: 'room_b' }, weight: 1 },
        ] },
        { id: 'rear', at: [6, 0, 0], size: [4, 5, 4], turn: 0, choices: [{ ref: { kind: 'piece', id: 'room_a' }, weight: 1 }] },
      ],
      joins: [
        { id: 'threshold', a: { slot: 'front', port: 'east' }, b: { slot: 'rear', port: 'west' },
          seam: { piece: 'threshold', at: [4, 0, 0], turn: 0, a: 'west', b: 'east' } },
      ],
      anchors: { entry: { kind: 'standing', at: [1, 1, 2] }, objective: { kind: 'standing', at: [9, 1, 2] } },
      ports: [{ id: 'west', slot: 'front', port: 'west' }, { id: 'east', slot: 'rear', port: 'east' }],
    },
  ],
  mapSites: [
    { id: 'fixture_site', assembly: 'fixture_route', origin: [0, 0, 0], turn: 0,
      routes: [{ from: 'entry', to: 'objective', traversal: 'walk', return: true }] },
  ],
}
