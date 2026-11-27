local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local empty = '..............';
local pad = 'kkkkkkkkkkkkkk';
local posts = ['...b.....b....', empty, '..p.......t...', empty, empty, empty, '..p.......t...', empty];
{
  templates: [{
    id: 'test_house_strut_knees',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [14, 9, 8],
    palette: {
      '.': 'air', k: 'concrete', b: 'brick', p: 'steel_joist', t: 'plank_wall',
      s: 'steel_strut_px', w: 'timber_strut_nx', a: 'steel_joist', f: 'plank_floor',
    },
    layers: [
      [pad, pad, pad, pad, pad, pad, pad, pad],
      posts,
      posts,
      posts,
      posts,
      ['...b.....b....', empty, '...s.....w....', empty, empty, empty, '...s.....w....', empty],
      ['...b.....b....', empty, '...aaa.fff....', empty, empty, empty, empty, empty],
      ['...b.....b....', empty, empty, empty, empty, empty, empty, empty],
      ['...b.....b....', empty, empty, empty, empty, empty, empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseStrutLook',
    buildings: layout.buildings + [{ template: 'test_house_strut_knees', position: [-12, 20.5, 14], rotation: 0 }],
    player: { position: [-10.25, 21, 16], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
