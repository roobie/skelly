local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole prop: a concrete wall carries a steel joist run out over a pad at eye height, with a concrete slab
// lying on the run. The run reaches out within steel's span, so the wall holds it until its end cell beside the wall
// is cut; that cell is the one the tester faces. A chain-link run, a galvanized wall and a plank post stand clear of
// the fall zone, so the other metals and the timber can be tried with the same torch.
local empty = '..........';
local low = ['k.........', 'k.....LLLL', 'k.........', '......GGGG', empty, '...p......', empty];
{
  templates: [{
    id: 'test_house_torch_cut',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [10, 7, 7],
    palette: {
      '.': 'air', k: 'concrete', J: 'steel_joist', L: 'chain_link', G: 'galvanized', p: 'plank_wall',
    },
    layers: [
      ['kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk', 'kkkkkkkkkk'],
      low,
      low,
      low,
      ['k.........', 'kJJJJ.....', 'k.........', empty, empty, empty, empty],
      ['.kkkk.....', '.kkkk.....', '.kkkk.....', empty, empty, empty, empty],
      [empty, empty, empty, empty, empty, empty, empty],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseTorchCutLook',
    buildings: layout.buildings + [
      { template: 'test_house_torch_cut', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Standing south of the cut cell in its column, outside the slab's footprint, facing north, so the eye-height
    // aim meets the joist end beside the wall; an empty slot row lets the bearing apply.
    player: { position: [-11.25, 21, 16.25], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
