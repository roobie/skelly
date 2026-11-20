// A windowless block with two downspouts down its north face, the side the spawn faces: the west pipe is sound, and
// the east pipe has one segment worn deep into its range two courses below the roof, high enough that the climber is
// well off the ground when it loads it and that a segment stays above the gap.
local size = [9, 8, 4];
local soundX = 2;
local wornX = 6;
local wornY = 6;
local cell(x, y, z) =
  if y == 0 || z > 0 then '#'
  else if x == soundX then 'P'
  else if x == wornX then (if y == wornY then 'W' else 'P')
  else '.';
{
  templates: [{
    id: 'downspout_look_block',
    size: size,
    lootContext: { usage: [], tier: 'Tier1' },
    palette: {
      '.': 'air', '#': 'concrete',
      P: { furniture: 'downspout', facing: 'n', fixed: true, wear: 0 },
      W: { furniture: 'downspout', facing: 'n', fixed: true, wear: 0.69 },
    },
    layers: [
      [std.join('', [cell(x, y, z) for x in std.range(0, size[0] - 1)]) for z in std.range(0, size[2] - 1)]
      for y in std.range(0, size[1] - 1)
    ],
  }],
}
