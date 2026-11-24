local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// A closed plank room east of a yard, one bare window in its west wall, a lamp lit on a crate inside, and a shambler
// in the yard. Spawned actors face east, so the shambler faces the window; it stands on the window's centre row and
// at the height where its eyes meet the window's centre cell and the lamp, so its sight line to the lamp passes the
// opening and not the frame or sill. The player starts inside the room beside the window, off that line, so the wall
// hides them from the shambler and only the lamp can draw it. The door lets the player leave.
local depth = 17;
local rows = std.range(0, depth - 1);
local between(row, low, high) = row >= low && row <= high;
local isWindowRow(row) = between(row, 7, 9);
local isCrateRow(row) = between(row, 7, 8);
local isDoorRow(row) = between(row, 7, 8);
local shamblerRow = 8;

local yard(row, layer) = if layer == 1 && row == shamblerRow then '...z.' else '.....';
local westWall(row, layer) = if between(layer, 2, 4) && isWindowRow(row) then 'G' else 'p';
local eastWall(row, layer) = if between(layer, 1, 4) && isDoorRow(row) then 'D' else 'p';
local interior(row, layer) = if between(layer, 1, 2) && isCrateRow(row) then '..CC.' else '.....';
local roomRow(row, layer) =
  if row == 0 || row == depth - 1 then 'ppppppp'
  else westWall(row, layer) + interior(row, layer) + eastWall(row, layer);
local storey(layer) = [yard(row, layer) + roomRow(row, layer) for row in rows];
{
  templates: [{
    id: 'test_house_lit_window',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [12, 7, depth],
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
      ['ffffffffffff' for _ in rows],
      storey(1),
      storey(2),
      storey(3),
      storey(4),
      storey(5),
      ['.....' + 'fffffff' for _ in rows],
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
