local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local floor = 'ffffffffffffffffffffffff';
local air = '........................';
{
  templates: [{
    id: 'test_house_furniture_batch_look',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [24, 6, 7],
    palette: {
      '.': 'air', f: 'plank_floor',
      // The three panes stand one behind another in the view from the spawn.
      W: { furniture: 'clear_hinged_window', facing: 's', fixed: true },
      D: { furniture: 'wood_door', facing: 's', fixed: true },
      B: { furniture: 'clear_casement_window', facing: 's', fixed: true, boarding: { type: 'wood_window_boarding', side: 'front' } },
      R: { furniture: 'improvised_wood_door', facing: 's', fixed: true, boarding: { type: 'wood_door_boarding', side: 'front' } },
      H: { furniture: 'roof_hatch', facing: 's', fixed: true },
      O: { furniture: 'wood_door', facing: 's', fixed: true },
      Q: { furniture: 'clear_hinged_window', facing: 's', fixed: true },
    },
    layers: [
      [floor, floor, floor, floor, floor, floor, floor],
      ['..........W.............', '................D..D....', '..........W.............', '................B..R....', '..........W.............', '....H.....O..Q..........', air],
      [air, air, air, air, air, air, air],
      [air, air, air, air, air, air, air],
      [air, air, air, air, air, air, air],
      [air, air, air, air, air, air, air],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseFurnitureBatchLook',
    buildings: layout.buildings + [
      { template: 'test_house_furniture_batch_look', position: [-12, 20.5, 14], rotation: 0 },
    ],
    player: { position: [-6.5, 21, 20.5], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
