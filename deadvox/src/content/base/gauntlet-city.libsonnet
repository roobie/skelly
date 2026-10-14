{
  furniture: [{
    id: 'gauntlet_car_wreck', name: 'Placeholder car wreck',
    size: [5, 2, 10], color: '#785e4b',
    shape: [
      { position: [0, 0.4, 0], size: [5, 0.7, 10] },
      { position: [0.4, 1.1, 2.6], size: [4.2, 0.9, 4.6] },
      { position: [0, 0, 1.2], size: [0.6, 1.2, 1.8] },
      { position: [4.4, 0, 1.2], size: [0.6, 1.2, 1.8] },
      { position: [0, 0, 7], size: [0.6, 1.2, 1.8] },
      { position: [4.4, 0, 7], size: [0.6, 1.2, 1.8] },
    ],
  }],
  templates: [{
    id: 'gauntlet_car_wreck', size: [5, 3, 10],
    lootContext: { usage: [], tier: 'Tier1' },
    palette: { '=': 'concrete', W: { furniture: 'gauntlet_car_wreck' } },
    layers: [
      ['=====', '=====', '=====', '=====', '=====', '=====', '=====', '=====', '=====', '====='],
      ['WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW'],
      ['WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW', 'WWWWW'],
    ],
  }],
}
