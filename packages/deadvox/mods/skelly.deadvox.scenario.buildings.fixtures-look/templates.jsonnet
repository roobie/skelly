// Every shared household fixture stands in one row against a back wall, fronts to the open side, so the look
// judges each against its neighbours at one scale. A bay groups what a house stands together: the cabinet hangs
// over the washbasin, chairs face the table, and the coal hatch sits in the wall it is cut through.
// The fronts face north, the side the building sheet calls its front.
local gap = 1;
local back = 4;
local piece(glyph, at, size) = { glyph: glyph, at: at, size: size };
local stood(glyph, width, height, depth) = piece(glyph, [0, 1, back - depth], [width, height, depth]);
local bays = [
  [stood('u', 2, 2, 2)],
  [stood('t', 2, 2, 2)],
  [stood('b', 2, 2, 1), piece('C', [0, 3, back - 1], [1, 1, 1])],
  [stood('i', 2, 2, 1)],
  [stood('h', 2, 2, 1)],
  [stood('K', 2, 2, 1)],
  [stood('F', 2, 4, 2)],
  [stood('A', 4, 2, 2)],
  [stood('S', 2, 4, 2)],
  [stood('p', 2, 2, 2)],
  [stood('T', 3, 2, 2), piece('c', [0, 1, 1], [1, 2, 1]), piece('c', [2, 1, 1], [1, 2, 1])],
  [stood('R', 2, 2, 1)],
  [stood('J', 3, 6, 2)],
  [stood('v', 3, 2, 2)],
  [piece('H', [0, 1, back], [2, 2, 1])],
];
local widthOf(bay) = std.foldl(std.max, [p.at[0] + p.size[0] for p in bay], 0);
local starts = std.foldl(function(xs, bay) xs + [xs[std.length(xs) - 1] + widthOf(bay) + gap], bays, [gap]);
local pieces = std.flattenArrays([
  [p + { x: starts[i] + p.at[0] } for p in bays[i]]
  for i in std.range(0, std.length(bays) - 1)
]);
local size = [starts[std.length(bays)], 7, back + 1];
local inside(p, x, y, z) =
  x >= p.x && x < p.x + p.size[0] && y >= p.at[1] && y < p.at[1] + p.size[1] && z >= p.at[2] && z < p.at[2] + p.size[2];
local cell(x, y, z) =
  local hits = [p.glyph for p in pieces if inside(p, x, y, z)];
  if std.length(hits) > 0 then hits[0] else if y == 0 || z == back then '#' else '.';
{
  templates: [{
    id: 'fixtures_look_row',
    size: size,
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    palette: {
      '.': 'air', '#': 'concrete',
      u: { furniture: 'toilet' },
      t: { furniture: 'steel_toilet' },
      b: { furniture: 'washbasin' },
      C: { furniture: 'bathroom_cabinet', loot: 'bathroom_cabinet' },
      i: { furniture: 'utility_sink' },
      h: { furniture: 'kitchen_sink' },
      K: { furniture: 'cooker' },
      F: { furniture: 'fridge' },
      A: { furniture: 'bathtub' },
      S: { furniture: 'shower_tray' },
      p: { furniture: 'privy_seat' },
      T: { furniture: 'kitchen_table' },
      c: { furniture: 'chair', facing: 's' },
      R: { furniture: 'panel_radiator' },
      J: { furniture: 'solid_fuel_boiler' },
      v: { furniture: 'coal_bin' },
      H: { furniture: 'coal_hatch' },
    },
    layers: [
      [std.join('', [cell(x, y, z) for x in std.range(0, size[0] - 1)]) for z in std.range(0, size[2] - 1)]
      for y in std.range(0, size[1] - 1)
    ],
  }],
}
