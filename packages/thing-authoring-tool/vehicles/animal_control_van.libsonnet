local k = import 'kit.libsonnet';
local s = import 'animal_control_van.spec.libsonnet';
local box = k.box;
local b = s.box;
local depth = b.glassIn - b.cageIn;
local tail = (import 'van-body.libsonnet').tail(s);
// One bar grille on the wall over a cage, proud enough that its bars hold at the vehicle grain.
local hatch(tag, x, y) = [
  box(tag + '_plate', 'dark', [x, y[0], b.side], [x + b.width, y[1], b.side + 0.012]),
  box(tag + '_head', 'steel', [x, y[1] - 0.04, b.side + 0.012], [x + b.width, y[1], b.side + 0.03]),
  box(tag + '_foot', 'steel', [x, y[0], b.side + 0.012], [x + b.width, y[0] + 0.04, b.side + 0.03]),
] + [
  box(tag + '_bar' + i, 'steel', [x + i * 0.145, y[0], b.side + 0.012], [x + i * 0.145 + 0.04, y[1], b.side + 0.03])
  for i in std.range(0, 4)
];
(import 'van-body.libsonnet').rows('animal_control_van', s) + [
  k.compound('animal_control_van_cage', 26, [
    box('floor', 'steel', [0, 0, 0], [b.width, 0.03, depth]),
    box('top', 'steel', [0, b.cageHeight - 0.03, 0], [b.width, b.cageHeight, depth]),
    box('front', 'steel', [b.width - 0.02, 0, 0], [b.width, b.cageHeight, depth]),
    box('rear', 'steel', [0, 0, 0], [0.02, b.cageHeight, depth]),
    box('back', 'steel', [0, 0, depth - 0.02], [b.width, b.cageHeight, depth]),
    box('door_rail', 'mesh', [0, 0.32, 0], [b.width, 0.36, 0.03]),
  ] + [
    box('door_bar' + i, 'mesh', [0.04 + i * 0.14, 0.03, 0], [0.08 + i * 0.14, b.cageHeight - 0.03, 0.03])
    for i in std.range(0, 3)
  ], { steel: 'steel-galvanised', mesh: 'steel-grey' }),
  k.compound('animal_control_van_hatches', 18, std.flattenArrays([
    hatch('low' + i, b.columns[i], [1.08, 1.54]) + hatch('high' + i, b.columns[i], [1.62, 2.1])
    for i in [0, 1, 2]
  ]), { dark: 'paint-charcoal', steel: 'steel-stainless' }),
  // One rear leaf's grilles, whose face looks along x.
  k.compound('animal_control_van_rear_hatches', 8, std.flattenArrays([
    [
      box(tag[0] + '_plate', 'dark', [tail - 0.012, tag[1], 0.12], [tail, tag[2], 0.82]),
      box(tag[0] + '_head', 'steel', [tail - 0.03, tag[2] - 0.04, 0.12], [tail - 0.012, tag[2], 0.82]),
      box(tag[0] + '_foot', 'steel', [tail - 0.03, tag[1], 0.12], [tail - 0.012, tag[1] + 0.04, 0.82]),
    ] + [
      box(tag[0] + '_bar' + i, 'steel', [tail - 0.03, tag[1], 0.12 + i * 0.165], [tail - 0.012, tag[2], 0.16 + i * 0.165])
      for i in std.range(0, 4)
    ]
    for tag in [['low', 1.08, 1.54], ['high', 1.62, 2.1]]
  ]), { dark: 'paint-charcoal', steel: 'steel-stainless' }),
]
