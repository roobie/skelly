local k = import 'kit.libsonnet';
local h = import 'trailer-frame.libsonnet';
local s = import 'caravan.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local arch = [s.axle - s.archHalf, s.axle + s.archHalf, s.skirt, s.archTop];
// Fills the opening's top corners, so the arch reads as five-sided rather than a square cut.
local archChamfers(slot, z) = [
  prism('arch_chamfer_rear', slot, [[arch[0], s.archTop - s.archChamfer], [arch[0] + s.archChamfer, s.archTop], [arch[0], s.archTop]], z),
  prism('arch_chamfer_front', slot, [[arch[1], s.archTop - s.archChamfer], [arch[1], s.archTop], [arch[1] - s.archChamfer, s.archTop]], z),
];
local windowOpening(from, width) = [from, from + width, s.windowLow, s.windowHigh];
local wallPieces(z, stripeZ, openings, stripeSpans) =
  h.wall('wall', 'paint', [s.rear, s.front], [s.skirt, s.eave], z, openings)
  + archChamfers('paint', z)
  + [
    box('stripe_' + i, 'stripe', [stripeSpans[i][0], s.stripeLow, stripeZ[0]], [stripeSpans[i][1], s.stripeHigh, stripeZ[1]])
    for i in std.range(0, std.length(stripeSpans) - 1)
  ];
local finish = { paint: s.paint, stripe: s.stripe };
local capZ = [-s.side - 0.02, s.side + 0.02];
local window(id, massKg, width) = k.compound(id, massKg, [
  box('glass', 'glass', [-width / 2, 0, s.side - 0.03], [width / 2, s.windowHigh - s.windowLow, s.side - 0.01]),
  box('frame_low', 'frame', [-width / 2, 0, s.side - 0.04], [width / 2, 0.04, s.side + 0.02]),
  box('frame_top', 'frame', [-width / 2, s.windowHigh - s.windowLow - 0.04, s.side - 0.04], [width / 2, s.windowHigh - s.windowLow, s.side + 0.02]),
] + [
  box('frame_rear', 'frame', [-width / 2, 0, s.side - 0.04], [-width / 2 + 0.04, s.windowHigh - s.windowLow, s.side + 0.02]),
  box('frame_front', 'frame', [width / 2 - 0.04, 0, s.side - 0.04], [width / 2, s.windowHigh - s.windowLow, s.side + 0.02]),
], { glass: 'glass-clear', frame: 'plastic-charcoal' });
[
  k.compound('caravan_chassis', 225, [
    box('rear_rail', 'frame', [s.rear, s.floorLow - 0.1, -0.65], [s.rear + 0.06, s.floorLow, 0.65]),
    box('mid_rail', 'frame', [s.axle - 0.05, s.floorLow - 0.1, -0.65], [s.axle + 0.05, s.floorLow, 0.65]),
    box('front_rail', 'frame', [s.front + 0.28, s.drawLow, -0.65], [s.front + 0.36, s.floorLow, 0.65]),
  ] + bothSides([
    box('side_rail', 'frame', [s.rear, s.floorLow - 0.1, 0.55], [s.front + 0.36, s.floorLow, 0.65]),
    box('spring', 'frame', [s.axle - 0.4, s.hub, 0.56], [s.axle + 0.4, s.floorLow - 0.1, 0.62]),
    box('arch_liner', 'frame', [arch[0], s.skirt, 0.7], [arch[1], s.floorLow, 0.74]),
  ]
  + archChamfers('frame', [0.7, 0.74])) + h.drawbar(s.front + 0.36, 0.6, s.tip, [s.drawLow, s.drawHigh]), { frame: 'paint-charcoal' }),
  k.compound('caravan_floor', 150, [
    box('deck', 'floor', [s.rear, s.floorLow, -s.skin], [s.front, s.floor, s.skin]),
  ], { floor: 'board-mdf' }),
  k.compound('caravan_wall_door', 125, wallPieces([s.skin, s.side], [s.side, s.side + 0.02], [
    windowOpening(s.smallRear, s.smallWindow),
    [s.doorRear, s.doorFront, s.floor + 0.06, s.doorTop],
    arch,
    windowOpening(s.largeFront, s.largeWindow),
  ], [[s.rear, s.doorRear], [s.doorFront, s.front]]), finish),
  k.compound('caravan_wall_plain', 130, wallPieces([-s.side, -s.skin], [-s.side - 0.02, -s.side], [
    windowOpening(s.farRear, s.largeWindow),
    arch,
    windowOpening(s.largeFront, s.largeWindow),
  ], [[s.rear, s.front]]), finish),
  k.compound('caravan_door', 18, [
    box('stripe', 'stripe', [s.doorRear + 0.02, s.stripeLow, s.side], [s.doorFront - 0.02, s.stripeHigh, s.side + 0.02]),
    box('window', 'glass', [s.doorRear + 0.12, 1.45, s.side - 0.03], [s.doorFront - 0.12, 1.95, s.side - 0.01]),
    box('handle', 'frame', [s.doorRear + 0.06, 1.2, s.side], [s.doorRear + 0.18, 1.24, s.side + 0.03]),
  ] + h.wall('skin', 'paint', [s.doorRear + 0.02, s.doorFront - 0.02], [s.floor + 0.08, s.doorTop - 0.02], [s.skin + 0.01, s.side], [[s.doorRear + 0.12, s.doorFront - 0.12, 1.45, 1.95]]),
  finish + { frame: 'plastic-charcoal', glass: 'glass-clear' }, { hinge_a: ['skin_pier_1', [1, 0.2, 1]], hinge_b: ['skin_pier_1', [1, 0.8, 1]] }),
  window('caravan_window_small', 4, s.smallWindow),
  window('caravan_window_large', 8, s.largeWindow),
  // The eaves round in over the walls, so the roof reads as a moulded shell.
  k.compound('caravan_roof', 110, [
    { id: 'shell', kind: 'prism', slot: 'paint', axis: 'x', start: s.rear - 0.02, end: s.front + 0.02,
      profile: [[s.eave, -s.side - 0.02], [s.eave + 0.1, -s.side + 0.06], [s.roof, -s.side + 0.4], [s.roof, s.side - 0.4], [s.eave + 0.1, s.side - 0.06], [s.eave, s.side + 0.02]] },
  ], { paint: s.paint }),
  k.compound('caravan_nose_cap', 60, [
    // Around the front window's opening, so the glass looks into the cabin.
    // The stripe is a slice of the cap, flush with the paint above it, so no edge of it shows from above.
    prism('below', 'paint', [[s.front, s.skirt], [s.front + 0.28, s.skirt], [s.front + 0.347, s.stripeLow], [s.front, s.stripeLow]], capZ),
    prism('stripe', 'stripe', [[s.front, s.stripeLow], [s.front + 0.347, s.stripeLow], [s.front + 0.36, s.stripeHigh], [s.front, s.stripeHigh]], capZ),
    prism('over_stripe', 'paint', [[s.front, s.stripeHigh], [s.front + 0.36, s.stripeHigh], [s.front + 0.33, 1.4], [s.front, 1.4]], capZ),
    prism('above', 'paint', [[s.front, 1.97], [s.front + 0.23, 1.97], [s.front + 0.14, 2.14], [s.front, s.eave]], [-s.side, s.side]),
  ] + bothSides([
    prism('cheek', 'paint', [[s.front, 1.4], [s.front + 0.33, 1.4], [s.front + 0.24, 1.95], [s.front + 0.23, 1.97], [s.front, 1.97]], [s.frontGlassHalf, s.side]),
  ]), finish),
  k.compound('caravan_tail_cap', 60, [
    // Around the rear window's opening, so the glass looks into the cabin.
    prism('below', 'paint', [[s.rear - 0.1, s.skirt], [s.rear, s.skirt], [s.rear, s.stripeLow], [s.rear - 0.15, s.stripeLow], [s.rear - 0.15, 0.6]], capZ),
    box('stripe', 'stripe', [s.rear - 0.15, s.stripeLow, capZ[0]], [s.rear, s.stripeHigh, capZ[1]]),
    box('over_stripe', 'paint', [s.rear - 0.15, s.stripeHigh, capZ[0]], [s.rear, 1.34, capZ[1]]),
    prism('above', 'paint', [[s.rear - 0.13, 1.92], [s.rear, 1.92], [s.rear, s.eave], [s.rear - 0.1, 2.12]], [-s.side, s.side]),
    box('bumper', 'frame', [s.rear - 0.2, s.skirt, -s.side + 0.04], [s.rear - 0.1, s.skirt + 0.1, s.side - 0.04]),
  ] + bothSides([
    prism('cheek', 'paint', [[s.rear - 0.15, 1.34], [s.rear, 1.34], [s.rear, 1.92], [s.rear - 0.13, 1.92], [s.rear - 0.15, 1.8]], [s.rearGlassHalf, s.side]),
  ]), finish + { frame: 'plastic-charcoal' }),
  k.compound('caravan_front_window', 12, [
    prism('glass', 'glass', [[s.front + 0.28, 1.4], [s.front + 0.32, 1.4], [s.front + 0.22, 1.97], [s.front + 0.18, 1.97]], [-s.frontGlassHalf, s.frontGlassHalf]),
  ], { glass: 'glass-clear' }),
  k.compound('caravan_rear_window', 10, [
    box('glass', 'glass', [s.rear - 0.12, 1.34, -s.rearGlassHalf], [s.rear - 0.09, 1.92, s.rearGlassHalf]),
  ], { glass: 'glass-clear' }),
  k.compound('caravan_gas_locker', 30, [
    box('body', 'paint', [s.front + 0.34, s.drawHigh, -0.74], [s.front + 0.72, s.stripeLow, 0.74]),
    box('stripe', 'stripe', [s.front + 0.34, s.stripeLow, -0.74], [s.front + 0.72, s.stripeHigh, 0.74]),
    box('top', 'paint', [s.front + 0.34, s.stripeHigh, -0.74], [s.front + 0.72, 1.16, 0.74]),
    box('lid', 'frame', [s.front + 0.72, s.drawHigh + 0.1, -0.5], [s.front + 0.74, s.stripeLow - 0.02, 0.5]),
  ], finish + { frame: 'plastic-charcoal' }),
  k.compound('caravan_furniture', 200, [
    box('front_lounge', 'wood', [1.0, s.floor, -s.skin + 0.02], [s.front, s.floor + 0.42, s.skin - 0.02]),
    box('rear_bed', 'wood', [s.rear, s.floor, -s.skin + 0.02], [s.doorRear - 0.1, s.floor + 0.42, s.skin - 0.02]),
    box('wardrobe', 'wood', [-0.74, s.floor, 0.5], [-0.14, s.eave - 0.06, s.skin - 0.02]),
    box('kitchen', 'wood', [-0.74, s.floor, -s.skin + 0.02], [0.3, s.floor + 0.86, -0.5]),
    box('cushion', 'cloth', [1.0, s.floor + 0.42, -s.skin + 0.02], [s.front, s.floor + 0.52, s.skin - 0.02]),
    box('bedding', 'cloth', [s.rear, s.floor + 0.42, -s.skin + 0.02], [s.doorRear - 0.1, s.floor + 0.52, s.skin - 0.02]),
  ], { wood: 'wood-pine', cloth: 'cloth-upholstery' }),
  h.leg('caravan_steady', 5, s.floorLow - 0.1, 0.07, 'steel-galvanised'),
]
