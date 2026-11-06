local k = import 'kit.libsonnet';
local s = import 'ice_cream_van.spec.libsonnet';
local box = k.box;
local b = s.box;
local w = b.windows[0];
local stripe = (w[1] - w[0] + 0.2) / 5;
(import 'van-body.libsonnet').rows('ice_cream_van', s) + [
  k.compound('ice_cream_van_serving_hatch', 22, [
    // Over the glass the helper fits on both walls: an open dark hatch here, and a plain wall on the far side.
    box('opening', 'dark', [w[0], b.waist, b.glassOut - 0.01], [w[1], b.windowTop, b.glassOut + 0.02]),
    box('far_blank', 'paint', [w[0], b.waist, -b.glassOut - 0.02], [w[1], b.windowTop, -b.glassOut + 0.01]),
    box('counter', 'counter', [w[0] - 0.1, b.waist - 0.05, b.glassOut + 0.02], [w[1] + 0.1, b.waist + 1 / 32, b.side + 0.24]),
    box('fascia', 'fascia', [w[0] - 0.1, b.waist - 0.13, b.side], [w[1] + 0.1, b.waist - 0.05, b.side + 0.03]),
  ] + [
    // The lifted hatch flap, painted in stripes and hinged along the window's head.
    {
      id: 'flap' + i, kind: 'prism', slot: if i % 2 == 0 then 'fascia' else 'counter', axis: 'x',
      profile: [[b.windowTop + 0.02, b.glassOut], [b.windowTop + 0.06, b.glassOut], [b.windowTop + 0.16, b.side + 0.35], [b.windowTop + 0.12, b.side + 0.35]],
      start: w[0] - 0.1 + i * stripe, end: w[0] - 0.1 + (i + 1) * stripe,
    }
    for i in std.range(0, 4)
  ] + [
    {
      id: 'stay' + i, kind: 'prism', slot: 'stay', axis: 'x',
      profile: [[b.waist + 0.3, b.glassOut], [b.waist + 0.34, b.glassOut], [b.windowTop + 0.11, b.side + 0.3], [b.windowTop + 0.07, b.side + 0.3]],
      start: [w[0] - 0.1, w[1] + 0.06][i], end: [w[0] - 0.06, w[1] + 0.1][i],
    }
    for i in [0, 1]
  ], { counter: 'plastic-gloss-white', fascia: 'plastic-pink', dark: 'plastic-black', paint: s.paint, stay: 'steel-grey' }),
  k.compound('ice_cream_van_roof_cone', 14, [
    box('plinth', 'plinth', [-0.75, b.roof, -0.25], [-0.25, b.roof + 0.04, 0.25]),
    k.turned('cone', 'cone', 'y', [[0.04, 0], [0.04, 0.05], [0.56, 0.2], [0.58, 0], [0.04, 0]], [-0.5, b.roof, 0]) + { sides: 12 },
    k.turned('scoop', 'cream', 'y', [[0.56, 0], [0.56, 0.25], [0.68, 0.22], [0.72, 0.17], [0.84, 0.14], [0.88, 0.09], [1.02, 0.03], [1.02, 0], [0.56, 0]], [-0.5, b.roof, 0]) + { sides: 12 },
  ], { plinth: 'plastic-pink', cone: 'paperboard-tan', cream: 'plastic-gloss-white' }),
  k.compound('ice_cream_van_freezer', 80, [
    box('carcass', 'body', [w[0], b.floor, 0.5], [w[1], b.waist - 0.08, b.skin]),
    box('lid', 'lid', [w[0], b.waist - 0.08, 0.5], [w[1], b.waist - 0.05, b.skin]),
  ], { body: 'plastic-gloss-white', lid: 'plastic-grey' }),
]
