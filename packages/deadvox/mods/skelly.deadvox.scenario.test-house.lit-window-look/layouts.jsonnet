local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// A closed plank room east of a yard, one bare window in its west wall, a crate inside, and a shambler in the yard.
// Spawned actors face east, so the shambler faces the window; it stands on the window's centre row (row 8) and at the
// height where its eyes meet the window's centre cell and the lamp the start puts on the crate, so its sight line to
// the lamp passes the opening and not the frame or sill. The player starts inside the room beside the window, off
// that line, so the wall hides them from the shambler. The door lets the player leave.
{
  templates: [{
    id: 'test_house_lit_window',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [12, 7, 17],
    palette: {
      '.': 'air',
      f: 'plank_floor',
      p: 'plank_wall',
      // A west-facing window's front is the yard, and its back, the latch side, is the room.
      G: { furniture: 'clear_casement_window', facing: 'w', fixed: true },
      D: { furniture: 'improvised_wood_door', facing: 'e' },
      C: { furniture: 'crate', facing: 'n' },
      z: { spawn: 'shambler' },
    },
    layers: [
      // Floor.
      ['ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff',
       'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff',
       'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff', 'ffffffffffff'],
      // Walls; the shambler, the crate's lower half and the door's foot.
      ['.....ppppppp', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.CC..D', '...z.p.CC..D', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....ppppppp'],
      // The window's lower row, the crate's upper half and the door.
      ['.....ppppppp', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....G.CC..D', '.....G.CC..D', '.....G.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....ppppppp'],
      // The window's centre row, level with the shambler's eyes and the lamp.
      ['.....ppppppp', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....G.....D', '.....G.....D', '.....G.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....ppppppp'],
      // The window's top row.
      ['.....ppppppp', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....G.....D', '.....G.....D', '.....G.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....ppppppp'],
      // The wall's top course.
      ['.....ppppppp', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p',
       '.....p.....p', '.....p.....p', '.....p.....p', '.....p.....p', '.....ppppppp'],
      // Roof.
      ['.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff',
       '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff',
       '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff', '.....fffffff'],
    ],
  }],
  layouts: [layout + {
    id: 'testHouseLitWindowLook',
    buildings: layout.buildings + [
      { template: 'test_house_lit_window', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Inside the room, in the cell east of the window's lower row, facing the window (west).
    player: { position: [-8.75, 21, 18.75], bearing: 90 },
    showroom: layout.showroom + { slots: [] },
  }],
}
