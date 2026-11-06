// A truck's cab and ladder chassis from one measurement spec, so each truck differs by its measures and body.
// `rows` presses the parts at the vehicle origin; `items` and `fittings` take deadvox's vehicle kit as an argument
// because this file also evaluates in the thing tool, where deadvox content is not on the path.
// A spec with `bonnet` gets a bonneted cab with wings; without it the cab sits over the engine with its wheel
// arches in the cab skirts. `crew` gives a second door pair at `[rear, front]`.
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local defaults = {
  bonnet: null,
  crew: null,
  skin: self.side - 0.05,
  glassIn: self.side - 0.1,
  glassOut: self.side - 0.02,
  low: self.r + 0.1,
  archHalf: self.r + 0.1,
  archTop: 2 * self.r + 0.08,
  archChamfer: 0.3,
  frontZ: self.side - self.wheelW / 2 - 0.02,
  rearZ: self.side - self.wheelW / 2 - 0.01,
  rearInnerZ: self.rearZ - self.wheelW,
  railZ: 0.44,
  railFront: if self.bonnet != null then self.bonnet.nose - 0.1 else self.face - 0.1,
  bumperLow: self.r + 0.02,
  bumperTop: self.floor - 0.12,
  bumperPaint: 'paint-charcoal',
  framePaint: 'paint-charcoal',
  doorFront: self.face - 0.16,
  windowTop: self.roof - 0.05,
  seatX: self.doorRear + 0.62,
  // A truck driver sits high over the wheel, so the seat stands on a riser unless the cab roof is too low for it.
  raisedSeat: true,
  seatY: self.floor + (if self.raisedSeat then 0.2 else 0),
  dashDepth: 0.52,
  binnacle: self.dashDepth >= 0.45,
  guard: true,
  guardTop: 2 * self.r + 0.06,
  frontAxlePart: 'steered_axle_heavy',
  frontAxleY: self.r - 0.52,
  grille: true,
  tankX: self.cabBack - 0.75,
  tankY: self.railBottom - 0.22,
  batteryX: self.tankX,
  batteryZ: self.side - 0.42,
  engineX: self.frontAxle - 0.25,
  engineY: self.railTop - 0.58,
  gearboxLength: 0.72,
  exhaustX: self.engineX - 3.6,
  exhaustY: self.railBottom - 0.16,
  radiatorX: self.face - 0.28,
  radiatorY: self.bumperLow + 0.02,
  lampX: if self.bonnet != null then self.front else self.face + 0.02,
  lampY: if self.bonnet != null then self.bumperLow + 0.1 else self.bumperTop + 0.03,
  lampZ: self.side - 0.24,
  markerZ: 0.6,
  frontPanelMass: 22,
  wiper: true,
};
local spec(s) = defaults + s;
// The two corner wedges that make a wheel opening five-sided: straight jambs, two chamfers and a flat head.
local archCorners(name, slot, x0, x1, top, c, inner, outer) = [
  prism(name + '_aft', slot, [[x0, top - c], [x0 + c, top], [x0, top]], [inner, outer]),
  prism(name + '_fore', slot, [[x1, top - c], [x1, top], [x1 - c, top]], [inner, outer]),
];
// Convex pieces hugging a wheel: a flat top and two chamfers, from `inner` to `outer` across z.
local archPieces(name, slot, s, top, y, inner, outer) =
  local x0 = s.frontAxle - s.archHalf;
  local x1 = s.frontAxle + s.archHalf;
  [box(name + '_top', slot, [x0, top, inner], [x1, y, outer])] + archCorners(name, slot, x0, x1, top, s.archChamfer, inner, outer);
// A thin fender over a wheel, flat on top and chamfered down both sides, thick enough to survive the voxel grain.
local fender(name, slot, x, hubY, top, thick, z) =
  local reach = top - hubY;
  local flat = reach * 0.414;
  local shoulder = hubY + flat;
  [
    box(name + '_top', slot, [x - flat, top, z[0]], [x + flat, top + thick, z[1]]),
    prism(name + '_aft', slot, [[x - reach, shoulder], [x - flat, top], [x - flat, top + thick], [x - reach - thick, shoulder]], z),
    prism(name + '_fore', slot, [[x + reach, shoulder], [x + reach + thick, shoulder], [x + flat, top + thick], [x + flat, top]], z),
  ];
local rows(id, s0) = {
  local s = spec(s0),
  local conventional = s.bonnet != null,
  local a = s.frontAxle,
  local h = s.archHalf,
  local roofFront = s.face - s.lean,
  local paint = { paint: s.paint, trim: 'plastic-black', glass: 'glass-clear', pan: 'paint-charcoal', cloth: 'cloth-seat', frame: s.framePaint, steel: 'steel-grey' },
  local leanAt(y) = (y - s.waist) * s.lean / (s.roof - s.waist),
  local crossmembers = [s.rear + 0.12 + i * (s.railFront - s.rear - 0.24) / 5 for i in std.range(0, 5)],
  local springs = [box('spring_' + i, 'spring', [([s.frontAxle] + s.rearAxles)[i] - 0.62, s.r + 0.04, s.railZ - 0.1], [([s.frontAxle] + s.rearAxles)[i] + 0.62, s.railBottom, s.railZ]) for i in std.range(0, std.length(s.rearAxles))],
  local batteryBoxPieces = local x = s.batteryX; local y = s.tankY; local inner = -s.batteryZ + 0.26; local outer = -s.batteryZ - 0.26; [
    box('battery_bracket', 'frame', [x - 0.34, y - 0.04, outer], [x + 0.34, y, -s.railZ]),
    box('battery_post', 'frame', [x - 0.04, y - 0.04, -s.railZ - 0.06], [x + 0.04, s.railBottom + 0.1, -s.railZ]),
    box('battery_lid', 'frame', [x - 0.34, y + 0.3, outer], [x + 0.34, y + 0.33, inner]),
    box('battery_wall', 'frame', [x - 0.34, y, outer], [x + 0.34, y + 0.3, outer + 0.03]),
    box('battery_fore', 'frame', [x + 0.31, y, outer], [x + 0.34, y + 0.3, inner]),
    box('battery_aft', 'frame', [x - 0.34, y, outer], [x - 0.31, y + 0.3, inner]),
  ],
  local door(suffix, massKg, rear, front, frontTop) = k.compound(id + suffix, massKg, [
    box('skin', 'paint', [rear, s.floor, s.skin], [front, s.waist, s.side]),
    box('trim', 'trim', [rear + 0.03, s.floor + 0.03, s.skin - 0.03], [front - 0.03, s.waist - 0.03, s.skin]),
    prism('glass', 'glass', [[rear, s.waist], [front, s.waist], [frontTop, s.windowTop], [rear, s.windowTop]], [s.skin, s.skin + 0.012]),
    box('handle', 'trim', [rear + 0.08, s.waist - 0.14, s.side], [rear + 0.24, s.waist - 0.09, s.side + 0.02]),
  ], paint, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
  local skirts =
    if conventional then [
      box('skirt', 'paint', [s.cabBack, s.low, s.skin], [s.face, s.floor, s.side]),
      box('step_upper', 'frame', [s.doorRear + 0.15, s.floor - 0.34, s.side], [s.doorFront - 0.15, s.floor - 0.28, s.side + 0.1]),
    ] else archPieces('arch', 'paint', s, s.archTop, s.floor, s.skin, s.side) + [
      box('skirt_fore', 'paint', [a + h, s.low, s.skin], [s.face - 0.05, s.floor, s.side]),
      box('skirt_aft', 'paint', [s.cabBack, s.low, s.skin], [a - h, s.floor, s.side]),
      box('step', 'frame', [s.cabBack + 0.04, s.low + 0.14, s.side], [a - h - 0.03, s.low + 0.2, s.side + 0.1]),
      box('step_recess', 'trim', [s.cabBack + 0.08, s.low + 0.42, s.side], [a - h - 0.07, s.low + 0.5, s.side + 0.02]),
      box('well', 'pan', [a - h, s.archTop - 0.03, s.railZ], [a + h, s.archTop, s.skin]),
      box('well_wall', 'pan', [a - h, 2 * s.r - 0.12, s.railZ + 0.0625], [a + h, s.archTop, s.railZ + 0.09375]),
    ] + archCorners('well', 'pan', a - h, a + h, s.archTop, s.archChamfer, s.railZ, s.skin),
  local rows = [
    k.compound(id + '_chassis', s.chassisMass, springs + [
      box('crossmember_' + i, 'frame', [crossmembers[i] - 0.05, s.railBottom + 0.02, -s.railZ], [crossmembers[i] + 0.05, s.railTop - 0.02, s.railZ]) for i in std.range(0, 5)
    ] + batteryBoxPieces + bothSides([
      box('rail', 'frame', [s.rear + 0.06, s.railBottom, s.railZ - 0.08], [s.railFront, s.railTop, s.railZ]),
      box('bracket', 'frame', [s.tankX - 0.2, s.tankY - 0.04, s.railZ], [s.tankX + 0.2, s.tankY, s.side - 0.12]),
      box('bracket_post', 'frame', [s.tankX - 0.04, s.tankY - 0.04, s.railZ], [s.tankX + 0.04, s.railBottom + 0.1, s.railZ + 0.06]),
    ]), { frame: s.framePaint, spring: 'steel-grey' }),
    k.compound(id + '_cab', s.shellMass, skirts_all + [
      box('floor', 'pan', [s.cabBack, s.floor - 0.05, -s.side], [s.face - 0.05, s.floor, s.side]),
      box('mat', 'trim', [s.cabBack + 0.06, s.floor, -s.skin], [s.face - 0.1, s.floor + 0.012, s.skin]),
      box('tunnel', 'trim', [s.seatX - 0.2, s.floor, -0.24], [s.face - 0.3, s.floor + 0.42, 0.24]),
      box('back_wall', 'paint', [s.cabBack, s.floor - 0.05, -s.side], [s.cabBack + 0.05, s.roof, s.side]),
      prism('roof', 'paint', [[s.cabBack, s.roof], [roofFront + 0.02, s.roof], [roofFront - 0.08, s.roof + 0.11], [s.cabBack, s.roof + 0.11]], [-s.side + 0.02, s.side - 0.02]),
      box('crown', 'paint', [s.cabBack, s.roof + 0.11, -s.side + 0.2], [roofFront - 0.14, s.roof + 0.15, s.side - 0.2]),
      box('visor', 'trim', [roofFront - 0.02, s.roof - 0.05, -s.glassIn], [roofFront + 0.05, s.roof + 0.02, s.glassIn]),
      box('headliner', 'headliner', [s.cabBack + 0.05, s.roof - 0.02, -s.skin], [roofFront - 0.08, s.roof, s.skin]),
    ] + (if conventional then [
      box('firewall', 'paint', [s.face - 0.05, s.floor - 0.05, -s.side], [s.face, s.waist, s.side]),
    ] else []), paint + { headliner: 'cloth-rag' }),
    k.compound(id + '_windscreen', 28, [
      prism('glass', 'glass', [[s.face - 0.05, s.waist], [s.face - 0.01, s.waist], [roofFront - 0.01, s.roof], [roofFront - 0.05, s.roof]], [-s.glassIn, s.glassIn]),
    ], { glass: 'glass-clear' }),
    k.compound(id + '_dashboard', 25, [
      box('lower', 'trim', [s.face - std.min(0.34, s.dashDepth - 0.04), s.floor, -s.skin + 0.04], [s.face - 0.1, s.waist - 0.2, s.skin - 0.04]),
      box('top', 'trim', [s.face - s.dashDepth, s.waist - 0.2, -s.skin + 0.04], [s.face - 0.04, s.waist - 0.04, s.skin - 0.04]),
    ], paint),
    k.compound(id + '_rear_underrun', 30, [
      box('bar', 'frame', [s.rear, s.railBottom - 0.24, -s.side + 0.1], [s.rear + 0.1, s.railBottom - 0.12, s.side - 0.1]),
    ] + bothSides([
      box('hanger', 'frame', [s.rear + 0.02, s.railBottom - 0.12, s.railZ - 0.08], [s.rear + 0.1, s.railBottom + 0.02, s.railZ]),
    ]), { frame: s.framePaint }),
  ] + (if s.guard then [
    local guardZ = [s.rearInnerZ - s.wheelW / 2 - 0.03, s.rearZ + s.wheelW / 2 + 0.01];
    local guardThick = 0.0625;
    local guardReach = s.guardTop - s.r;
    k.compound(id + '_mudguard', 9, std.flattenArrays([
      fender('guard_' + i, 'guard', s.rearAxles[i], s.r, s.guardTop, guardThick, guardZ) + [
        box('stay_' + i, 'guard', [s.rearAxles[i] - 0.04, std.min(s.railTop - 0.1, s.guardTop), s.railZ], [s.rearAxles[i] + 0.04, s.guardTop + guardThick, guardZ[0]]),
      ]
      for i in std.range(0, std.length(s.rearAxles) - 1)
    ]) + [
      box('flap', 'flap', [std.foldl(std.min, s.rearAxles, s.rearAxles[0]) - guardReach - guardThick, 0.25, guardZ[0]], [std.foldl(std.min, s.rearAxles, s.rearAxles[0]) - guardReach, s.r + guardReach * 0.414, guardZ[1]]),
    ], { guard: 'paint-charcoal', flap: 'rubber-black' }),
  ] else []) + (if conventional then [
    k.compound(id + '_bonnet', 70, [
      prism('skin', 'paint', [[s.face, s.bonnet.back - 0.2], [s.bonnet.nose, s.bonnet.front - 0.2], [s.bonnet.nose, s.bonnet.front], [s.face, s.bonnet.back]], [-s.bonnet.z, s.bonnet.z]),
      prism('side', 'paint', [[s.face, s.floor], [s.bonnet.nose, s.floor], [s.bonnet.nose, s.bonnet.front], [s.face, s.bonnet.back]], [-s.bonnet.z, s.bonnet.z]),
    ], paint),
    local wingTop = s.archTop + 0.12;
    k.compound(id + '_wing', 26, archPieces('arch', 'paint', s, wingTop, wingTop + 0.05, s.bonnet.z, s.side) + [
      box('well_wall', 'pan', [a - h, 2 * s.r - 0.12, s.bonnet.z], [a + h, wingTop, s.bonnet.z + 0.03125]),
      prism('fore', 'paint', [[a + h, wingTop - s.archChamfer], [s.bonnet.nose, wingTop - 0.26], [s.bonnet.nose, wingTop - 0.21], [a + h, wingTop + 0.05]], [s.bonnet.z, s.side]),
      prism('aft', 'paint', [[s.face, s.low + 0.1], [a - h, wingTop - s.archChamfer], [a - h, wingTop + 0.05], [s.face, s.floor]], [s.bonnet.z, s.side]),
    ], paint),
    k.compound(id + '_front_panel', 40, [
      box('surround', 'steel', [s.bonnet.nose, s.bumperTop - 0.04, -s.bonnet.z - 0.02], [s.bonnet.nose + 0.04, s.bonnet.front + 0.03, s.bonnet.z + 0.02]),
      box('core', 'trim', [s.bonnet.nose + 0.03, s.bumperTop + 0.02, -s.bonnet.z + 0.05], [s.bonnet.nose + 0.05, s.bonnet.front - 0.03, s.bonnet.z - 0.05]),
    ] + [
      box('bar_' + i, 'steel', [s.bonnet.nose + 0.05, s.bumperTop + 0.1 + i * (s.bonnet.front - s.bumperTop - 0.15) / 6, -s.bonnet.z + 0.05], [s.bonnet.nose + 0.06, s.bumperTop + 0.13 + i * (s.bonnet.front - s.bumperTop - 0.15) / 6, s.bonnet.z - 0.05])
      for i in std.range(0, 5)
    ], paint + { steel: 'steel-stainless' }),
    k.compound(id + '_front_bumper', 50, [
      box('bar', 'bar', [s.bonnet.nose - 0.02, s.bumperLow, -s.side], [s.front, s.bumperTop, s.side]),
    ], { bar: s.bumperPaint }),
  ] else [
    k.compound(id + '_front_panel', s.frontPanelMass, [
      box('face', 'paint', [s.face - 0.05, s.bumperTop - 0.02, -s.side], [s.face, s.waist, s.side]),
    ] + (if s.grille then [
      box('grille', 'trim', [s.face, s.floor + 0.02, -s.side + 0.42], [s.face + 0.012, s.waist - 0.2, s.side - 0.42]),
    ] + [
      box('slat_' + i, 'paint', [s.face + 0.012, s.floor + 0.08 + i * 0.13, -s.side + 0.46], [s.face + 0.02, s.floor + 0.12 + i * 0.13, s.side - 0.46])
      for i in std.range(0, std.floor((s.waist - s.floor - 0.34) / 0.13))
    ] else []), paint),
    k.compound(id + '_front_bumper', 40, [
      box('bar', 'bar', [s.face - 0.06, s.bumperLow, -s.side], [s.front, s.bumperTop, s.side]),
      box('step', 'trim', [s.front - 0.01, s.bumperLow + 0.3, -0.5], [s.front + 0.005, s.bumperLow + 0.36, 0.5]),
    ], { bar: s.bumperPaint, trim: 'plastic-black' }),
  ]) + (if s.crew != null then [
    door('_crew_door', 34, s.crew[0], s.crew[1], s.crew[1]),
  ] else []) + [
    door('_door', 42, s.doorRear, s.doorFront, s.doorFront - leanAt(s.windowTop)),
  ],
  local skirts_all = bothSides(skirts + [
    prism('a_pillar', 'paint', [[s.doorFront, s.waist], [s.face, s.waist], [roofFront, s.roof], [s.doorFront - s.lean, s.roof]], [s.glassIn, s.side]),
    box('corner', 'paint', [s.doorFront, s.floor, s.skin], [s.face - 0.05, s.waist, s.side]),
    box('cant_rail', 'paint', [s.cabBack, s.windowTop, s.glassIn - 0.04], [roofFront, s.roof + 0.01, s.side]),
  ] + (if s.crew == null then [
    box('b_pillar', 'paint', [s.cabBack, s.floor, s.skin], [s.doorRear, s.windowTop, s.side]),
  ] else [
    box('centre_pillar', 'paint', [s.crew[1], s.floor, s.skin], [s.doorRear, s.windowTop, s.side]),
    box('crew_rear', 'paint', [s.cabBack, s.floor, s.skin], [s.crew[0], s.windowTop, s.side]),
  ])),
  rows: rows,
}.rows;
local items(kit, id, name, s0) = local s = spec(s0); local pile = kit.pileSize; [
  kit.part(id + '_chassis', name + ' chassis', pile, ['structure']),
  kit.part(id + '_cab', name + ' cab', pile, ['structure', 'protection']),
  kit.part(id + '_windscreen', name + ' windscreen', pile, ['glazing']),
  kit.part(id + '_dashboard', name + ' dashboard', pile, ['structure']),
  kit.part(id + '_rear_underrun', name + ' rear underrun bar', pile, ['protection']),
  kit.part(id + '_door', name + ' door', pile, ['entry', 'glazing', 'protection']),
  kit.part(id + '_front_panel', name + ' front panel', pile, ['protection']),
  kit.part(id + '_front_bumper', name + ' front bumper', pile, ['protection']),
] + (if s.guard then [kit.part(id + '_mudguard', name + ' mudguard', pile, ['protection'])] else [])
  + (if s.bonnet != null then [
    kit.part(id + '_bonnet', name + ' bonnet', pile, ['protection']),
    kit.part(id + '_wing', name + ' wing', pile, ['protection']),
  ] else [])
  + (if s.crew != null then [kit.part(id + '_crew_door', name + ' crew door', pile, ['entry', 'glazing', 'protection'])] else []);
local fittings(kit, id, s0) = local s = spec(s0); local fitting = kit.fitting; local pair = kit.pair; local on = kit.on; local origin = kit.origin;
  local rearN = std.length(s.rearAxles);
  local gearboxX = s.engineX - s.engineLength / 2 - s.gearboxLength / 2;
  local shaftFrom = gearboxX - s.gearboxLength / 2;
  local shaftTo = s.rearAxles[0];
  local shaftCount = std.ceil((shaftFrom - shaftTo) / 2.6);
  local shaftStep = (shaftFrom - shaftTo) / shaftCount;
  [
    fitting('chassis', id + '_chassis', origin),
    fitting('front_axle', s.frontAxlePart, [s.frontAxle, s.frontAxleY, 0], ['chassis']),
    fitting('cab', id + '_cab', origin, ['chassis']),
    fitting('windscreen', id + '_windscreen', origin, ['cab']),
    fitting('dashboard', id + '_dashboard', origin, ['cab']),
    fitting('front_panel', id + '_front_panel', origin, if s.bonnet != null then ['chassis'] else ['cab']),
    fitting('front_bumper', id + '_front_bumper', origin, ['chassis']),
    fitting('rear_underrun', id + '_rear_underrun', origin, ['chassis']),
    fitting('engine', s.engine, [s.engineX, s.engineY, 0], ['chassis']),
    fitting('gearbox', s.gearbox, [gearboxX, s.engineY + 0.12, 0], ['engine']),
    fitting('radiator', s.radiator, [s.radiatorX, s.radiatorY, 0], ['chassis']),
    fitting('fuel_tank', 'fuel_tank_truck', [s.tankX, s.tankY, s.side - 0.34], ['chassis']),
    fitting('exhaust', 'exhaust_long', [s.exhaustX, s.exhaustY, 0.2], ['engine', 'chassis']),
    // The driver sits on the far side, away from the kerb, as on the buses.
    fitting('steering_wheel', 'steering_wheel', [s.face - s.dashDepth - 0.03, s.seatY + 0.72, -0.58], ['dashboard']),
    fitting('gear_lever', 'gear_lever', [s.seatX + 0.3, s.floor + 0.42, 0], ['cab']),
    fitting('marker_lamp_mid', 'marker_lamp', [s.face - s.lean - 0.12, s.roof + 0.11, 0], ['cab']),
  ] + [
    fitting('rear_axle_' + i, 'beam_axle_truck', [s.rearAxles[i], s.r - 0.52, 0], ['chassis'])
    for i in std.range(0, rearN - 1)
  ] + [
    fitting('prop_shaft_' + i, 'prop_shaft_long', [shaftFrom - shaftStep * (i + 0.5), s.railBottom + 0.02, 0], ['chassis'])
    for i in std.range(0, shaftCount - 1)
  ] + (if rearN > 1 then [
    fitting('inter_axle_shaft', 'prop_shaft_short', [(s.rearAxles[0] + s.rearAxles[1]) / 2, s.r + 0.1, 0], ['rear_axle_0', 'rear_axle_1']),
  ] else []) + std.flattenArrays([
    pair('rear_wheel_' + i, s.wheel, [s.rearAxles[i], s.r, s.rearZ], on(['rear_axle_' + i]))
    + pair('rear_inner_wheel_' + i, s.wheel, [s.rearAxles[i], s.r, s.rearInnerZ], on(['rear_axle_' + i]))
    for i in std.range(0, rearN - 1)
  ]) + pair('front_wheel', s.wheel, [s.frontAxle, s.r, s.frontZ], on(['front_axle']))
  + (if s.raisedSeat then pair('seat_riser', 'seat_riser', [s.seatX, s.floor, 0.58], on(['cab'])) + pair('seat', 'front_seat', [s.seatX, s.seatY, 0.58], on([], ['seat_riser']))
     else pair('seat', 'front_seat', [s.seatX, s.seatY, 0.58], on(['cab'])))
  + (if s.binnacle then [fitting('instrument_binnacle', 'instrument_binnacle', [s.face - s.dashDepth + 0.18, s.waist - 0.04, -0.58], ['dashboard'])] else [])
  + pair('door', id + '_door', origin, on(['cab']))
  + pair('mirror', 'door_mirror_large', [s.face - 0.1, s.waist, s.side], on(['cab']))
  + pair('tail_lamp', 'tail_lamp_small', [s.rear - 0.01, s.railBottom - 0.12, std.get(s, 'tailLampZ', s.side - 0.28)], on(['rear_underrun']))
  + kit.headlamps(s.lampX, s.lampY, s.lampZ, ['front_bumper'])
  + pair('marker_lamp', 'marker_lamp', [s.face - s.lean - 0.12, s.roof + 0.11, s.markerZ], on(['cab']))
  + kit.batteryBay('truck_battery_tray', [s.batteryX, s.tankY, -s.batteryZ], ['chassis'])
  + (if s.guard then pair('mudguard', id + '_mudguard', origin, on(['chassis'])) else [])
  + (if s.bonnet != null then [fitting('bonnet', id + '_bonnet', origin, ['chassis'])] + pair('wing', id + '_wing', origin, on(['chassis'])) else [])
  + (if s.crew != null then pair('crew_door', id + '_crew_door', origin, on(['cab'])) else []);
{
  spec: spec,
  archCorners: archCorners,
  rows: rows,
  items: items,
  fittings: fittings,
}
