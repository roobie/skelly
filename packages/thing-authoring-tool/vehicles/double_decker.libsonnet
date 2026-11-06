local k = import 'kit.libsonnet';
local s = import 'double_decker.spec.libsonnet';
local count = 10;
local low = s.floor;
local high = s.decks[1].floor;
local rise = (high - low) / count;
local run = (s.stairs.low - s.stairs.high) / count;
local lid = s.archTop + 0.06;
(import 'bus-body.libsonnet').rows('double_decker', s) + [
  // Treads beside the front wheelhouse stop at its wall and only widen to the skin above its lid.
  k.compound('double_decker_stairs', 90, std.flattenArrays([
    local x0 = s.stairs.low - run * (i + 1);
    local x1 = s.stairs.low - run * i;
    local top = low + rise * (i + 1);
    local overArch = x1 > s.frontAxle - s.arch && x0 < s.frontAxle + s.arch;
    local wall = if overArch then -s.frontWell else -s.skin;
    [
      k.box('tread_' + i, 'tread', [x0, low, wall], [x1, top, s.stairs.inner]),
      k.box('toe_' + i, 'edge', [x1 - 0.015, top - 0.03, if top > lid then -s.skin else wall], [x1, top, s.stairs.inner]),
    ] + (if overArch && top > lid then [
           k.box('tread_over_' + i, 'tread', [x0, lid, -s.skin], [x1, top, wall]),
         ] else [])
    for i in std.range(0, count - 1)
  ]), { tread: 'plastic-charcoal', edge: 'paint-crane-yellow' }),
  // The rails around the stairwell are bright, so the stairs read through the upper windows.
  k.compound('double_decker_stair_rail', 14, [
    k.box('top', 'bright', [s.stairWell.x[0], 0.86, -0.02], [s.stairWell.x[1], 0.9, 0.02]),
    k.turned('post_a', 'bright', 'y', k.disc(0.02, 0, 0.86), [s.stairWell.x[0] + 0.03, 0, 0]),
    k.turned('post_b', 'bright', 'y', k.disc(0.02, 0, 0.86), [s.stairWell.x[1] - 0.03, 0, 0]),
  ], { bright: 'paint-crane-yellow' }),
]
