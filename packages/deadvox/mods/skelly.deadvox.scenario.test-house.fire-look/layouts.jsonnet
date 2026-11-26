local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
{
  templates: [{
    id: 'test_house_fire_shed',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [9, 6, 9],
    palette: { '.': 'air', k: 'concrete', t: 'plank_wall' },
    layers: [
      ['kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk'],
      ['ttttttttt', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 'ttt...ttt'],
      ['ttttttttt', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 'ttt...ttt'],
      ['ttttttttt', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 'ttt...ttt'],
      ['ttttttttt', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 't.......t', 'ttttttttt'],
      ['ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt', 'ttttttttt'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFireLook',
    buildings: layout.buildings + [{ template: 'test_house_fire_shed', position: [-12, 20.5, 14], rotation: 0 }],
    player: { position: [-9.75, 21, 19.5], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
