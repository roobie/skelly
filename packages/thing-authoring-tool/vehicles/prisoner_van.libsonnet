local k = import 'kit.libsonnet';
local s = import 'prisoner_van.spec.libsonnet';
local van = import 'van-body.libsonnet';
local box = k.box;
local tail = van.tail(s);
// Vertical bars at a spacing the vehicle grain can hold, with top and bottom rails tying them to the frame.
local bars(tag, from, to, count, piece) = [
  piece(tag + '_bar' + i, from + (to - from) * (i + 0.5) / count)
  for i in std.range(0, count - 1)
];
local rearBar(id, z) = box(id, 'steel', [tail - 0.03, s.windowSill, z - 0.02], [tail + 0.01, s.windowTop, z + 0.02]);
// Whole grains wide and apart, or rounding leaves some bars thicker than others.
local grain = 1 / 32;
local sideBars(tag, z, window) =
  local middle = std.round((window[0] + window[1]) / 2 / grain);
  [
    box(tag + '_' + i, 'steel', [(middle + i * 4 - 1) * grain, s.windowSill, z[0]], [(middle + i * 4 + 1) * grain, s.windowTop, z[1]])
    for i in [-1, 0, 1]
  ];
van.rows('prisoner_van', s) + [
  // One rear leaf's window bars.
  k.compound('prisoner_van_rear_bars', 9, bars('rear', 0.1, s.hatchSide - 0.1, 5, rearBar) + [
    box('rail_low', 'steel', [tail - 0.03, s.windowSill - 0.03, 0.08], [tail, s.windowSill + 0.01, s.hatchSide - 0.08]),
    box('rail_high', 'steel', [tail - 0.03, s.windowTop - 0.01, 0.08], [tail, s.windowTop + 0.03, s.hatchSide - 0.08]),
  ], { steel: 'steel-grey' }),
  k.compound('prisoner_van_side_bars', 14, std.flattenArrays([
    sideBars('near_' + i, [s.glassOut - 0.01, s.glassOut + 0.03], s.windows[i])
    for i in [0, 1]
  ] + [
    sideBars('far_' + i, [-s.glassOut - 0.03, -s.glassOut + 0.01], s.windows[i])
    for i in [0, 1, 2]
  ]), { steel: 'steel-grey' }),
  // A steel cage wall behind the cab, so the prisoners can't reach the driver.
  k.compound('prisoner_van_cab_cage', 40, [
    box('frame_top', 'steel', [-0.08, 2.1, -0.84], [-0.04, 2.14, 0.84]),
    box('frame_bottom', 'steel', [-0.08, s.floor, -0.84], [-0.04, s.floor + 0.04, 0.84]),
  ] + [
    box('bar' + i, 'steel', [-0.08, s.floor, -0.82 + i * 0.205], [-0.04, 2.1, -0.78 + i * 0.205])
    for i in std.range(0, 8)
  ], { steel: 'steel-grey' }),
  // A steel bench down a wall, so its occupants sit facing across the aisle.
  k.compound('prisoner_van_side_bench', 38, [
    box('seat', 'steel', [-2.8, 0.98, 0.3], [-0.5, 1.04, 0.72]),
    box('back', 'steel', [-2.8, 1.04, 0.66], [-0.5, 1.6, 0.72]),
    box('leg_rear', 'steel', [-2.7, s.floor, 0.34], [-2.62, 0.98, 0.72]),
    box('leg_front', 'steel', [-0.7, s.floor, 0.34], [-0.62, 0.98, 0.72]),
  ], { steel: 'steel-grey' }),
]
