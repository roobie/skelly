local k = import 'kit.libsonnet';
local s = import 'food_truck.spec.libsonnet';
local box = k.box;
local w = s.windows[0];
local x0 = w[0] - 0.15;
local x1 = w[1] + 0.15;
local n = 6;
local xprism(id, slot, profile, x) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: x[0], end: x[1] };
local awningTop = s.windowTop + 0.1;
(import 'van-body.libsonnet').rows('food_truck', s) + [
  k.compound('food_truck_counter', 20, [
    box('counter', 'steel', [x0, s.waist - 0.05, s.side], [x1, s.waist, s.side + 0.26]),
    box('fascia', 'steel', [x0, s.waist - 0.13, s.side], [x1, s.waist - 0.05, s.side + 0.03]),
    // Over the glass the helper fits on both walls: an open dark hatch here, and the kitchen's solid back wall on the
    // far side.
    box('opening', 'dark', [w[0], s.waist, s.glassOut - 0.01], [w[1], s.windowTop, s.glassOut + 0.02]),
    box('far_blank', 'paint', [w[0], s.waist, -s.glassOut - 0.02], [w[1], s.windowTop, -s.glassOut + 0.01]),
    box('far_vent', 'dark', [-1.5, 1.72, -s.glassOut - 0.05], [-1.0, 2.0, -s.glassOut - 0.02]),
  ], { steel: 'steel-stainless', dark: 'plastic-black', paint: s.paint }),
  k.compound('food_truck_awning', 18, [
    xprism('stripe' + i, if i % 2 == 0 then 'red' else 'white',
           [[awningTop, s.glassOut], [awningTop + 0.03, s.glassOut], [awningTop - 0.2, s.side + 0.8], [awningTop - 0.23, s.side + 0.8]],
           [x0 + i * (x1 - x0) / n, x0 + (i + 1) * (x1 - x0) / n])
    for i in std.range(0, n - 1)
  ] + [
    xprism('strut' + i, 'steel',
           [[awningTop - 0.65, s.glassOut], [awningTop - 0.61, s.glassOut], [awningTop - 0.21, s.side + 0.72], [awningTop - 0.25, s.side + 0.72]],
           [[x0, x1 - 0.04][i], [x0 + 0.04, x1][i]])
    for i in [0, 1]
  ], { red: 'cloth-red', white: 'cloth-white', steel: 'steel-grey' }),
  k.compound('food_truck_kitchen', 140, [
    box('plinth', 'steel', [-2.4, s.floor, -0.72], [-0.2, s.archTop + 0.02, -0.5]),
    box('counter', 'steel', [-2.4, s.archTop + 0.02, -s.glassIn], [-0.2, 1.24, -0.5]),
    box('hood', 'steel', [-1.6, 2.1, -s.glassIn], [-0.8, 2.45, -0.5]),
  ], { steel: 'steel-stainless' }),
  k.compound('food_truck_flue', 8, [
    k.turned('stack', 'steel', 'y', [[0, 0], [0, 0.14], [0.26, 0.14], [0.26, 0.22], [0.34, 0.22], [0.34, 0], [0, 0]], [-1.2, s.roof, -0.5]) + { sides: 12 },
  ], { steel: 'steel-galvanised' }),
]
