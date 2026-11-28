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
  }, {
    id: 'test_house_fire_post',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [6, 7, 5],
    palette: { '.': 'air', k: 'concrete', t: 'plank_wall', f: 'plank_floor', c: 'charred_remains' },
    layers: [
      ['kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk'],
      ['..t...', '......', '......', 't...c.', '......'],
      ['..t...', '......', '......', '......', '......'],
      ['..t...', '......', '......', '......', '......'],
      ['..t...', '......', '......', '......', '......'],
      ['..ttt.', '..f...', '..f...', '......', '......'],
      ['......', '......', '......', '......', '......'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFireLook',
    buildings: layout.buildings + [
      { template: 'test_house_fire_shed', position: [-12, 20.5, 14], rotation: 0 },
      { template: 'test_house_fire_post', position: [-5, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-3.75, 21, 17], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
