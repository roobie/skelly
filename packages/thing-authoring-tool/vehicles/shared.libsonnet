// Parts real vehicles share. Each has its own frame, so any blueprint can place it: x forward, y up from the
// part's base, centred on x and z unless a comment says otherwise. Deadvox's items for these rows are in
// `packages/deadvox/src/content/base/vehicles/shared-parts.libsonnet`.
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local tyreProfile(width, rim, outer) = [[-width / 2, rim], [-width / 2, outer - width * 0.1], [-width * 0.42, outer], [width * 0.42, outer], [width / 2, outer - width * 0.1], [width / 2, rim], [-width / 2, rim]];
// A turned row's eight default flats read as an octagon at the vehicle grain, so wheels take more.
local roundSides = 24;
local wheel(id, massKg, width, rim, outer, sides=roundSides) = k.compound(id, massKg, [
  k.turned('tyre', 'tyre', 'z', tyreProfile(width, rim, outer)) + { sides: sides },
  k.turned('rim', 'rim', 'z', k.disc(rim, -width * 0.35, width * 0.35)) + { sides: sides },
], { tyre: 'rubber-black', rim: 'steel-grey' }, { hub: ['rim', [0.5, 0.5, 0.5]] });
// Farm tyres read by their bar lugs: each is a slab on the tyre's shoulder, alternating sides, and a dark centre breaks up the rim.
local lugs(width, base, outer, count) = [
  local a = 2 * std.pi * i / count;
  local d = 0.045 / outer;
  local at(r, t) = [r * std.cos(t), r * std.sin(t)];
  k.prism('lug_' + i, 'tyre', [at(base, a - d), at(outer, a - d), at(outer, a + d), at(base, a + d)], if i % 2 == 0 then [-0.01, width / 2] else [-width / 2, 0.01])
  for i in std.range(0, count - 1)
];
local farmWheel(id, massKg, width, rim, outer, count) = k.compound(id, massKg, [
  k.turned('tyre', 'tyre', 'z', tyreProfile(width, rim, outer - 0.04)) + { sides: roundSides },
  k.turned('rim', 'rim', 'z', k.disc(rim, -width * 0.35, width * 0.35)) + { sides: roundSides },
  k.turned('centre', 'centre', 'z', k.disc(rim * 0.62, -width * 0.39, width * 0.39)) + { sides: roundSides },
  k.turned('boss', 'rim', 'z', k.disc(rim * 0.26, -width * 0.44, width * 0.44)) + { sides: 12 },
] + lugs(width, outer - 0.05, outer, count), { tyre: 'rubber-black', rim: 'steel-grey', centre: 'paint-charcoal' }, { hub: ['rim', [0.5, 0.5, 0.5]] });
// Two wheels on one hub, with the origin on the hub between them.
local twinWheel(id, massKg, width, rim, outer) = k.compound(id, massKg, [
  k.turned('spacer', 'rim', 'z', k.disc(rim * 0.6, -width * 0.2, width * 0.2)) + { sides: roundSides },
] + k.bothSides([
  k.turned('tyre', 'tyre', 'z', tyreProfile(width, rim, outer), [0, 0, width / 2 + 0.003]) + { sides: roundSides },
  k.turned('rim', 'rim', 'z', k.disc(rim, -width * 0.35, width * 0.35), [0, 0, width / 2 + 0.003]) + { sides: roundSides },
]), { tyre: 'rubber-black', rim: 'steel-grey' }, { hub: ['spacer', [0.5, 0.5, 0.5]] });
// A spare carried on a rear face and seen end on, so it turns about x: the mount face is x = 0 on the wheel's axis
// and the tyre stands rearward of it.
local spareCarrier = k.compound('spare_wheel_carrier', 38, [
  box('bracket', 'steel', [-0.04, -0.12, -0.12], [0, 0.12, 0.12]),
  k.turned('tyre', 'tyre', 'x', [[-0.27, 0.19], [-0.27, 0.34], [-0.245, 0.367], [-0.065, 0.367], [-0.04, 0.34], [-0.04, 0.19], [-0.27, 0.19]]) + { sides: roundSides },
  k.turned('rim', 'steel', 'x', k.disc(0.19, -0.24, -0.04)) + { sides: roundSides },
  k.turned('hub', 'cap', 'x', k.disc(0.08, -0.26, -0.24)) + { sides: 12 },
], { tyre: 'rubber-black', steel: 'steel-grey', cap: 'paint-charcoal' });
// An engine with its crank along x; `length` is along the crank.
local inline(id, massKg, length, width, height) = k.compound(id, massKg, [
  box('sump', 'casting', [-length / 2, 0, -width * 0.42], [length / 2, height * 0.2, width * 0.42]),
  box('block', 'casting', [-length / 2, height * 0.2, -width / 2], [length / 2, height * 0.72, width / 2]),
  box('head', 'casting', [-length * 0.47, height * 0.72, -width * 0.44], [length * 0.47, height * 0.92, width * 0.44]),
  box('cover', 'cover', [-length * 0.43, height * 0.92, -width * 0.36], [length * 0.43, height, width * 0.36]),
  box('intake', 'casting', [-length * 0.38, height * 0.45, width / 2], [length * 0.38, height * 0.82, width * 0.68]),
], { casting: 'steel-grey', cover: 'paint-charcoal' });
// A vee has two rows of cylinders, so it reads wider and lower than an inline of the same mass.
local vee(id, massKg, length, width, height) = k.compound(id, massKg, [
  box('sump', 'casting', [-length / 2, 0, -width * 0.3], [length / 2, height * 0.22, width * 0.3]),
  box('block', 'casting', [-length / 2, height * 0.22, -width * 0.32], [length / 2, height * 0.55, width * 0.32]),
  box('intake', 'cover', [-length * 0.42, height * 0.55, -width * 0.14], [length * 0.42, height, width * 0.14]),
] + k.bothSides([
  box('bank', 'casting', [-length / 2, height * 0.55, width * 0.14], [length / 2, height * 0.9, width / 2]),
]), { casting: 'steel-grey', cover: 'paint-charcoal' });
local gearbox(id, massKg, length, width, height) = k.compound(id, massKg, [
  box('case', 'casting', [-length / 2, 0, -width / 2], [length / 2, height, width / 2]),
], { casting: 'steel-grey' });
local radiator(id, massKg, width, height) = k.compound(id, massKg, [
  box('core', 'core', [-0.03, 0, -width / 2], [0.03, height, width / 2]),
], { core: 'paint-charcoal' });
local tank(id, massKg, finish, length, width, height) = k.compound(id, massKg, [
  box('tank', 'tank', [-length / 2, 0, -width / 2], [length / 2, height, width / 2]),
], { tank: finish });
// A straight run along x from `-length / 2` to the tail at x = 0 is the wrong way round for a blueprint to place,
// so the origin is the silencer's centre and the pipe runs forward to `pipe`.
local exhaust(id, massKg, pipe, tail, silencer, tip='steel-stainless', steel='steel-spall-black') = k.compound(id, massKg, [
  box('pipe', 'steel', [silencer[0] / 2, 0.04, -0.03], [pipe, 0.1, 0.03]),
  box('silencer', 'steel', [-silencer[0] / 2, 0, -silencer[1] / 2], [silencer[0] / 2, 0.14, silencer[1] / 2]),
  box('tailpipe', 'steel', [-silencer[0] / 2 - tail + 0.0625, 0.04, -0.03], [-silencer[0] / 2, 0.1, 0.03]),
  box('tip', 'tip', [-silencer[0] / 2 - tail, 0.04, -0.03], [-silencer[0] / 2 - tail + 0.0625, 0.1, 0.03]),
], { steel: steel, tip: tip });
// Stands out of a hull side: the mount is at the origin on the skin, +z points out and the pipe turns up clear of the hull.
local exhaustSideHigh = k.compound('exhaust_side_high', 16, [
  box('flange', 'steel', [-0.09, -0.09, 0], [0.09, 0.09, 0.03125]),
  box('elbow', 'steel', [-0.05, -0.05, 0.03125], [0.05, 0.05, 0.16]),
  k.turned('pipe', 'steel', 'y', k.disc(0.05, -0.05, 0.94), [0, 0, 0.11]) + { sides: 12 },
  k.turned('silencer', 'steel', 'y', k.disc(0.09, 0.2, 0.7), [0, 0, 0.11]) + { sides: 12 },
  k.turned('lip', 'steel', 'y', k.disc(0.065, 0.9, 0.94), [0, 0, 0.11]) + { sides: 12 },
], { steel: 'steel-spall-black' });
// MacPherson strut, near side, about the hub. A beam axle carries both wheels at `track` / 2 from the centre plane.
local strut(id, massKg) = k.compound(id, massKg, [
  box('lower_arm', 'steel', [-0.14, -0.1, -0.27], [0.14, -0.05, -0.04]),
  box('knuckle', 'steel', [-0.05, -0.06, -0.05], [0.05, 0.06, 0]),
  k.turned('damper', 'spring', 'y', k.disc(0.035, 0, 0.47), [0, 0.06, -0.02]),
], { steel: 'steel-grey', spring: 'paint-charcoal' }, { hub: ['knuckle', [0.5, 0.5, 1]] });
local beamAxle(id, massKg, track, radius, height) = k.compound(id, massKg, [
  k.turned('beam', 'steel', 'z', k.disc(radius, -track / 2, track / 2), [0, height, 0]) + { sides: 12 },
  box('diff', 'steel', [-0.14, height - 0.13, -0.13], [0.14, height + 0.13, 0.13]),
] + k.bothSides([
  box('spring_seat', 'steel', [-0.09, height + radius - 0.01, track / 2 - 0.36], [0.09, height + radius + 0.04, track / 2 - 0.22]),
  k.turned('drum', 'steel', 'z', k.disc(radius * 2.4, -0.06, 0.06), [0, height, track / 2 - 0.1]) + { sides: 12 },
]), { steel: 'steel-grey' });
// An undriven axle has no differential; its frame matches `beamAxle`, so hubs sit at `height` above the base.
local trailerAxle(id, massKg, track, radius, height) = k.compound(id, massKg, [
  k.turned('beam', 'steel', 'z', k.disc(radius, -track / 2, track / 2), [0, height, 0]),
] + k.bothSides([
  box('spring_seat', 'steel', [-0.08, height + radius, track / 2 - 0.36], [0.08, height + radius + 0.04, track / 2 - 0.26]),
  k.turned('drum', 'steel', 'z', k.disc(radius * 2.2, -0.05, 0.05), [0, height, track / 2 - 0.1]),
]), { steel: 'steel-grey' });
// A steered I-beam for 295 wheels, in `beamAxle`'s frame: the king pins stand at the beam's ends.
local steeredAxle(id, massKg, halfTrack, height) = k.compound(id, massKg, [
  box('beam', 'steel', [-0.06, height - 0.06, -halfTrack], [0.06, height + 0.06, halfTrack]),
] + k.bothSides([
  box('spring_seat', 'steel', [-0.09, height + 0.06, 0.42], [0.09, height + 0.1, 0.56]),
  box('king_pin', 'steel', [-0.08, height - 0.12, halfTrack - 0.1], [0.08, height + 0.12, halfTrack + 0.05]),
]), { steel: 'steel-grey' });
// For 8 R19.5 wheels: lighter section, its spring seats under a medium truck's rails.
local steeredAxleMedium = k.compound('steered_axle_medium', 150, [
  box('beam', 'steel', [-0.045, 0.385, -0.95], [0.045, 0.475, 0.95]),
] + k.bothSides([
  box('spring_seat', 'steel', [-0.07, 0.475, 0.32], [0.07, 0.5, 0.46]),
  box('king_pin', 'steel', [-0.06, 0.33, 0.87], [0.06, 0.53, 1.0]),
]), { steel: 'steel-grey' });
// A low floor passes over the beam, so it drops between risers in the wheel wells, and hubs stay `beamAxle`'s `height`
// above the base.
local steeredAxleDrop = k.compound('steered_axle_drop', 260, [
  box('beam', 'steel', [-0.06, 0.2, -0.86], [0.06, 0.31, 0.86]),
] + k.bothSides([
  box('riser', 'steel', [-0.07, 0.2, 0.86], [0.07, 0.64, 0.95]),
]), { steel: 'steel-grey' });
local twistBeam(id, massKg, track) = k.compound(id, massKg, [
  box('beam', 'steel', [0.18, 0.25, -track / 2 + 0.1], [0.26, 0.33, track / 2 - 0.1]),
] + k.bothSides([
  box('trailing_arm', 'steel', [-0.04, 0.27, track / 2 - 0.16], [0.3, 0.34, track / 2 - 0.1]),
  box('stub', 'steel', [-0.04, 0.28, track / 2 - 0.1], [0.04, 0.36, track / 2 - 0.03]),
]), { steel: 'steel-grey' });
local propShaft(id, massKg, length) = k.compound(id, massKg, [
  k.turned('tube', 'steel', 'x', k.disc(0.04, -length / 2, length / 2)),
], { steel: 'steel-grey' });
// A seat for two or three, its back at -x.
local bench(id, massKg, width) = k.compound(id, massKg, [
  box('base', 'frame', [-0.25, 0, -width / 2], [0.25, 0.14, width / 2]),
  box('cushion', 'cloth', [-0.28, 0.14, -width / 2], [0.26, 0.26, width / 2]),
  k.prism('back', 'cloth', [[-0.28, 0.24], [-0.17, 0.24], [-0.3, 0.86], [-0.41, 0.86]], [-width / 2, width / 2]),
], { frame: 'steel-grey', cloth: 'cloth-seat' });
// Sits straight on a seat box, so it has no frame of its own and its back stands lower.
local benchLow = k.compound('bench_seat_low', 14, [
  box('cushion', 'cloth', [-0.28, 0, -0.5], [0.26, 0.12, 0.5]),
  k.prism('back', 'cloth', [[-0.28, 0.1], [-0.17, 0.1], [-0.27, 0.56], [-0.38, 0.56]], [-0.5, 0.5]),
], { cloth: 'cloth-seat' });
// An open machine's seat: a pan on a stem with a low back, far smaller than a road seat.
local panSeat = k.compound('pan_seat', 9, [
  box('stem', 'frame', [-0.1, 0, -0.1], [0.1, 0.12, 0.1]),
  box('pan', 'cloth', [-0.24, 0.12, -0.22], [0.2, 0.2, 0.22]),
  k.prism('back', 'cloth', [[-0.25, 0.18], [-0.17, 0.18], [-0.23, 0.52], [-0.31, 0.52]], [-0.2, 0.2]),
], { frame: 'paint-charcoal', cloth: 'rubber-black' }, { hips: ['pan', [0.4, 1, 0.5]] });
// Fittings don't rotate, so the rake is built in: a ring of short boxes round the origin at the hub, its forward edge high.
local steeringWheelRaked =
  local radius = 0.18;
  local rake = 35 * std.pi / 180;
  local count = 20;
  local ringAt(i) = local t = 2 * std.pi * i / count; [radius * std.sin(t) * std.cos(rake), radius * std.sin(t) * std.sin(rake), radius * std.cos(t)];
  k.compound('steering_wheel_raked', 2, [
    local c = ringAt(i);
    box('rim_' + i, 'grip', [c[0] - 0.022, c[1] - 0.018, c[2] - 0.022], [c[0] + 0.022, c[1] + 0.018, c[2] + 0.022])
    for i in std.range(0, count - 1)
  ] + [
    box('hub', 'hub', [-0.05, -0.03, -0.05], [0.05, 0.03, 0.05]),
    box('spoke', 'hub', [-0.02, -0.012, -radius], [0.02, 0.012, radius]),
    box('stem', 'hub', [-0.02, -0.14, -0.02], [0.02, -0.03, 0.02]),
  ], { grip: 'polymer-black', hub: 'plastic-black' }, { column: ['stem', [0.5, 0, 0.5]] });
local busSeat = k.compound('bus_seat_pair', 22, [
  box('leg', 'frame', [-0.05, 0, -0.02], [0.05, 0.4, 0.02]),
  box('cushion', 'cloth', [-0.2, 0.4, -0.45], [0.22, 0.5, 0.45]),
  k.prism('back', 'cloth', [[-0.2, 0.48], [-0.12, 0.48], [-0.2, 1.0], [-0.28, 1.0]], [-0.45, 0.45]),
  box('rail', 'frame', [-0.3, 1.0, -0.45], [-0.26, 1.04, 0.45]),
], { frame: 'steel-stainless', cloth: 'cloth-seat' });
// `bus_seat_pair`'s frame: the tall back, split headrest and upholstered ends fill a coach's window line.
local busSeatCoach = k.compound('bus_seat_coach', 34, [
  box('leg', 'frame', [-0.08, 0, -0.03], [0.08, 0.36, 0.03]),
  box('cushion', 'cloth', [-0.22, 0.36, -0.45], [0.24, 0.5, 0.45]),
  k.prism('back', 'cloth', [[-0.24, 0.46], [-0.04, 0.46], [-0.18, 1.14], [-0.38, 1.14]], [-0.45, 0.45]),
] + k.bothSides([
  box('headrest', 'head', [-0.4, 1.1, 0.04], [-0.18, 1.3, 0.42]),
  box('end', 'cloth', [-0.24, 0.32, 0.45], [0.2, 0.54, 0.48]),
]), { frame: 'paint-charcoal', cloth: 'cloth-seat', head: 'cloth-rag' });
// Hard crew seating. A bench lies along x with its back at +z, so a mirrored pair puts both backs to the walls and the
// crew faces inward; y = 0 is the floor.
local crewBench = k.compound('crew_bench', 24, [
  box('plank', 'seat', [-0.8, 0.42, -0.2], [0.8, 0.47, 0.2]),
  box('back', 'seat', [-0.8, 0.62, 0.2], [0.8, 0.92, 0.24]),
  box('wall_rail', 'frame', [-0.8, 0.42, 0.24], [0.8, 0.46, 0.28]),
] + std.flattenArrays([
  local x = -0.72 + 0.72 * i;
  [
    box('leg_' + i, 'frame', [x - 0.03, 0, -0.17], [x + 0.03, 0.42, -0.11]),
    box('brace_' + i, 'frame', [x - 0.03, 0, -0.17], [x + 0.03, 0.05, 0.28]),
    box('upright_' + i, 'frame', [x - 0.03, 0, 0.24], [x + 0.03, 0.92, 0.28]),
  ]
  for i in [0, 1, 2]
]), { seat: 'polymer-black', frame: 'steel-parkerized' });
local busSeatSingle = k.compound('bus_seat_single', 12, [
  box('leg', 'frame', [-0.05, 0, -0.02], [0.05, 0.4, 0.02]),
  box('cushion', 'cloth', [-0.2, 0.4, -0.225], [0.22, 0.5, 0.225]),
  k.prism('back', 'cloth', [[-0.2, 0.48], [-0.12, 0.48], [-0.2, 1.0], [-0.28, 1.0]], [-0.225, 0.225]),
  box('rail', 'frame', [-0.3, 1.0, -0.225], [-0.26, 1.04, 0.225]),
], { frame: 'steel-stainless', cloth: 'cloth-seat' });
local grabPole(id, massKg, height) = k.compound(id, massKg, [
  k.turned('pole', 'bright', 'y', k.disc(0.025, 0, height)),
  k.turned('foot', 'bright', 'y', k.disc(0.05, 0, 0.03)),
  k.turned('head', 'bright', 'y', k.disc(0.05, height - 0.03, height)),
], { bright: 'paint-crane-yellow' });
// Stands on its base; a blueprint lifts it to the frame rail or chassis.
local exhaustStack = k.compound('exhaust_stack', 35, [
  k.turned('pipe', 'steel', 'y', k.disc(0.065, 0, 2.6)) + { sides: 12 },
  k.turned('silencer', 'steel', 'y', k.disc(0.12, 0.35, 1.45)) + { sides: 12 },
  k.turned('lip', 'steel', 'y', k.disc(0.085, 2.54, 2.6)) + { sides: 12 },
  box('clamp', 'clamp', [-0.15, 1.5, -0.04], [0, 1.56, 0.04]),
], { steel: 'steel-stainless', clamp: 'paint-charcoal' });
local exhaustStackSmall = k.compound('exhaust_stack_small', 9, [
  k.turned('pipe', 'steel', 'y', k.disc(0.035, 0, 0.98)),
  k.turned('silencer', 'steel', 'y', k.disc(0.06, 0.1, 0.6)),
  box('cap', 'steel', [-0.05, 0.98, -0.05], [0.07, 1.02, 0.05]),
], { steel: 'steel-spall-black' });
local roofVent = k.compound('roof_vent', 3, [
  box('frame', 'frame', [-0.26, 0, -0.26], [0.26, 0.04, 0.26]),
  box('lid', 'glass', [-0.22, 0.04, -0.22], [0.22, 0.08, 0.22]),
], { frame: 'plastic-white', glass: 'plastic-frosted' });
// The mount is at the origin and the arm runs out along +z, as `door_mirror` does.
local doorMirrorLarge = k.compound('door_mirror_large', 4, [
  box('arm', 'trim', [-0.02, 0.2, 0], [0.02, 0.24, 0.16]),
  box('housing', 'trim', [-0.04, 0, 0.14], [0.04, 0.44, 0.34]),
  box('glass', 'mirror', [-0.05, 0.02, 0.16], [-0.04, 0.42, 0.32]),
], { trim: 'plastic-black', mirror: 'glass-grey' });
// A ram's horn. The mount is at the origin on the body, +z out: the arm arches up and out while sweeping forward, then
// hangs, so the tall head droops below the mount, ahead of it and well clear of the body. A chain of short boxes because
// a prism cannot follow a curve in all three axes.
local doorMirrorBus =
  local reach = 0.36;
  local rise = 0.2;
  local sweep = 0.3;
  local count = 12;
  local hornAt(i) =
    local t = i / count;
    local a = std.pi * (1 - t);
    [sweep * t, rise * std.sin(a), reach / 2 * (1 + std.cos(a))];
  local top = -0.2;
  local bottom = -0.82;
  local lean = 0.07;
  local front = sweep + 0.05;
  k.compound('door_mirror_bus', 6, [
    box('foot', 'arm', [-0.07, -0.07, 0], [0.07, 0.07, 0.03125]),
  ] + [
    local c = hornAt(i);
    box('horn_' + i, 'arm', [c[0] - 0.035, c[1] - 0.035, c[2] - 0.035], [c[0] + 0.035, c[1] + 0.035, c[2] + 0.035])
    for i in std.range(0, count)
  ] + [
    box('drop', 'arm', [sweep - 0.035, top - 0.04, reach - 0.035], [sweep + 0.035, 0.035, reach + 0.035]),
    k.prism('head', 'arm', [[front - lean - 0.1, bottom], [front - lean, bottom], [front, top], [front - 0.1, top]], [reach - 0.11, reach + 0.11]),
    k.prism('glass', 'mirror', [[front - lean - 0.135, bottom + 0.03], [front - lean - 0.1, bottom + 0.03], [front - 0.1, top - 0.03], [front - 0.135, top - 0.03]], [reach - 0.08, reach + 0.08]),
  ], { arm: 'plastic-black', mirror: 'glass-grey' });
// The mount is at the origin and +z points out. Two long arms carry the head clear of a box body wider than the cab.
local doorMirrorBox = k.compound('door_mirror_box', 5, [
  box('arm_upper', 'trim', [-0.02, 0.4, 0], [0.02, 0.44, 0.48]),
  box('arm_lower', 'trim', [-0.02, 0.06, 0], [0.02, 0.1, 0.48]),
  box('housing', 'trim', [-0.04, 0, 0.46], [0.04, 0.5, 0.66]),
  box('glass', 'mirror', [-0.0725, 0.02, 0.48], [-0.04, 0.48, 0.64]),
], { trim: 'plastic-black', mirror: 'glass-grey' });
// A small round chromed head for an old car, placed as `door_mirror` is: the mount at the origin, +z out.
local doorMirrorBright = k.compound('door_mirror_bright', 1, [
  box('arm', 'chrome', [-0.02, 0.02, 0], [0.02, 0.06, 0.08]),
  k.turned('head', 'chrome', 'x', k.disc(0.07, -0.03, 0.03), [0, 0.05, 0.13]) + { sides: 12 },
  k.turned('glass', 'mirror', 'x', k.disc(0.055, -0.0625, -0.03), [0, 0.05, 0.13]) + { sides: 12 },
], { chrome: 'steel-bright', mirror: 'glass-grey' });
// A round lens in a dark bowl behind two guard bars, its lens toward +x and its base at y = 0. The bars sit near the rim
// so the lens still reads as round between them.
local headlampMilitary = k.compound('headlamp_military', 3, [
  k.turned('bowl', 'bowl', 'x', k.disc(0.125, -0.06, 0.03), [0, 0.125, 0]) + { sides: 12 },
  k.turned('lens', 'lens', 'x', k.disc(0.1, 0.03, 0.0625), [0, 0.125, 0]) + { sides: 12 },
  box('guard_upper', 'guard', [0.0625, 0.18, -0.13], [0.094, 0.21, 0.13]),
  box('guard_lower', 'guard', [0.0625, 0.04, -0.13], [0.094, 0.07, 0.13]),
] + k.bothSides([
  box('guard_post', 'guard', [0.03, 0.04, 0.11], [0.094, 0.21, 0.135]),
]), { bowl: 'paint-charcoal', lens: 'plastic-frosted', guard: 'steel-spall-black' });
// An old car's chromed bowl on a stalk, its lens toward +x inside a dark ring; y = 0 is the foot of the stalk and the
// lens stands above it.
local headlampRound = k.compound('headlamp_round', 2, [
  box('stalk', 'bowl', [-0.04, 0, -0.03], [0.04, 0.05, 0.03]),
  k.turned('bowl', 'bowl', 'x', k.disc(0.125, -0.08, 0.03), [0, 0.165, 0]) + { sides: 12 },
  k.turned('ring', 'ring', 'x', k.disc(0.11, 0.03, 0.0625), [0, 0.165, 0]) + { sides: 12 },
  k.turned('lens', 'lens', 'x', k.disc(0.085, 0.0625, 0.094), [0, 0.165, 0]) + { sides: 12 },
], { bowl: 'steel-stainless', ring: 'plastic-black', lens: 'plastic-frosted' });
// A machine's lamp on a short bracket: y = 0 is the bracket's foot, and `dir` is the way the lens faces along x, since
// fittings don't turn.
local workLamp(id, dir) =
  local lens = if dir > 0 then [0.03, 0.0625] else [-0.0625, -0.03];
  k.compound(id, 1, [
    box('bracket', 'trim', [-0.04, 0, -0.03], [0.04, 0.05, 0.03]),
    box('housing', 'trim', [-0.03, 0.05, -0.05], [0.03, 0.15, 0.05]),
    box('lens', 'lens', [lens[0], 0.06, -0.04], [lens[1], 0.14, 0.04]),
  ], { trim: 'plastic-black', lens: 'plastic-frosted' });
// A blue roof bar: y = 0 is the roof and the bar is centred on the origin.
local lightBarBlue = k.compound('light_bar_blue', 12, [
  box('bar', 'bar', [-0.125, 0.03125, -0.72], [0.125, 0.1, 0.72]),
] + k.bothSides([
  box('foot', 'bar', [-0.075, 0, 0.55], [0.075, 0.03125, 0.65]),
  box('lens', 'lens', [-0.105, 0.1, 0.2], [0.105, 0.2, 0.7]),
]), { bar: 'plastic-black', lens: 'plastic-blue' });
// A small plate on a skin. `hybrid_badge` lies on a side panel with z = 0 the skin and +z out; `hybrid_badge_rear` lies
// on a rear face with x = 0 the skin and -x out.
local hybridBadge = k.compound('hybrid_badge', 0.1, [
  box('plate', 'plate', [-0.11, 0, 0], [0.11, 0.0625, 0.03125]),
], { plate: 'plastic-green' });
local hybridBadgeRear = k.compound('hybrid_badge_rear', 0.1, [
  box('plate', 'plate', [-0.03125, 0, -0.11], [0, 0.0625, 0.11]),
], { plate: 'plastic-green' });
// A walk-in van's side step. The origin is the tread's rear inner corner, on the skin at the underside of the tread; x
// runs forward along the door and +z out, so a mirrored pair serves both sides.
local doorStepWalkIn = k.compound('door_step_walk_in', 12, [
  box('tread', 'tread', [0, 0, 0], [1.19, 0.04, 0.16]),
] + [
  box('hanger' + i, 'tread', [0.05 + i * 0.99, 0.04, 0], [0.1 + i * 0.99, 0.12, 0.03])
  for i in [0, 1]
], { tread: 'steel-galvanised' });
// Under a rear door: the origin is the centre of the tread's forward edge on the body's rear face, the tread runs back
// along -x and y = 0 is its underside.
local rearStepTread = k.compound('rear_step_tread', 14, [
  box('tread', 'tread', [-0.24, 0, -0.6], [0, 0.05, 0.6]),
] + k.bothSides([
  box('bracket', 'tread', [-0.06, 0.05, 0.42], [0, 0.16, 0.48]),
]), { tread: 'steel-galvanised' });
local headlampLarge = k.compound('headlamp_large', 3, [
  box('housing', 'trim', [-0.05, 0, -0.17], [0.03, 0.22, 0.17]),
  box('lens', 'lens', [0.03, 0.02, -0.15], [0.06, 0.2, 0.15]),
], { trim: 'plastic-black', lens: 'plastic-frosted' });
// A drawbar's tip, forward of the origin on the bar's rear face, so a trailer's towed end faces its tractor.
local trailerCoupling = k.compound('trailer_coupling', 9, [
  box('neck', 'frame', [0, 0, -0.05], [0.16, 0.1, 0.05]),
  box('head', 'coupling', [0.14, -0.01, -0.07], [0.34, 0.15, 0.07]),
  box('socket', 'frame', [0.2, -0.04, -0.045], [0.3, -0.01, 0.045]),
  box('lever', 'lever', [0.18, 0.15, -0.02], [0.32, 0.18, 0.02]),
], { frame: 'steel-galvanised', coupling: 'paint-charcoal', lever: 'plastic-black' });
// Tall enough to pass the lowest and the highest drawbar, like a jockey post standing proud above its clamp.
local trailerLeg = k.compound('trailer_leg', 9, [
  box('foot', 'foot', [-0.1, 0, -0.1], [0.1, 0.04, 0.1]),
  k.turned('tube', 'tube', 'y', k.disc(0.04, 0.04, 0.85)),
  box('handle', 'foot', [-0.14, 0.85, -0.02], [0.14, 0.89, 0.02]),
], { tube: 'steel-galvanised', foot: 'paint-charcoal' });
// y = 0 is the ground under the tyre, so the fitting's `at` stands on the ground below the drawbar and the post rises
// past it; the blueprint places the post against a drawbar rail.
local jockeyWheel = k.compound('trailer_jockey_wheel', 8, [
  k.turned('tyre', 'tyre', 'z', k.disc(0.09, -0.03, 0.03), [0, 0.09, 0]) + { sides: 12 },
  box('crown', 'frame', [-0.04, 0.2, -0.06], [0.04, 0.24, 0.06]),
  k.turned('post', 'frame', 'y', k.disc(0.04, 0.24, 0.62)) + { sides: 12 },
  box('handle', 'grip', [-0.1, 0.62, -0.02], [0.1, 0.65, 0.02]),
] + k.bothSides([
  box('fork', 'frame', [-0.03, 0.09, 0.03], [0.03, 0.2, 0.06]),
]), { tyre: 'rubber-black', frame: 'steel-galvanised', grip: 'paint-charcoal' });
// Holds `car_battery` as `kit.batteryBay` places it, 3 cm above the tray's base.
local truckBatteryTray = k.compound('truck_battery_tray', 5, [
  box('base', 'steel', [-0.3, 0, -0.22], [0.3, 0.03, 0.22]),
] + k.bothSides([
  box('lip', 'steel', [-0.3, 0.03, 0.19], [0.3, 0.09, 0.22]),
]), { steel: 'steel-grey' }, { seat: ['base', [0.5, 1, 0.5]] });
// A traction motor lies across the vehicle on its base, its reduction gear built in; the orange lead marks high voltage.
local tractionMotor(id, massKg, radius, length) = k.compound(id, massKg, [
  k.turned('stator', 'casing', 'z', k.disc(radius, -length / 2, length / 2), [0, radius, 0]) + { sides: 12 },
  box('reducer', 'casing', [-radius * 1.3, 0, -length * 0.3], [0, radius * 1.3, length * 0.3]),
  box('lead', 'lead', [radius, radius * 0.8, -0.03], [radius + 0.08, radius * 0.8 + 0.06, 0.03]),
], { casing: 'alu-bare', lead: 'plastic-orange' });
local inverter(id, massKg, length, height, width) = k.compound(id, massKg, [
  box('case', 'casing', [-length / 2, 0, -width / 2], [length / 2, height, width / 2]),
  box('lid', 'lid', [-length * 0.45, height, -width * 0.45], [length * 0.45, height + 0.03, width * 0.45]),
  box('lead', 'lead', [length / 2, height * 0.3, -0.04], [length / 2 + 0.06, height * 0.3 + 0.06, 0.04]),
], { casing: 'alu-bare', lid: 'paint-charcoal', lead: 'plastic-orange' });
// A flat pack: y = 0 is its underside, so its top meets the floor pan it bolts under.
local tractionPack(id, massKg, length, height, width) = k.compound(id, massKg, [
  box('case', 'casing', [-length / 2, 0, -width / 2], [length / 2, height, width / 2]),
  box('lead', 'lead', [length / 2 - 0.1, height, -0.05], [length / 2 - 0.04, height + 0.05, 0.05]),
], { casing: 'paint-charcoal', lead: 'plastic-orange' });
// A bus's roof pack as a faired pod, y = 0 on the roof: chamfered ends, a stepped upper deck and vent strips, with the
// lead out of sight beneath.
local tractionPackRoof(id, massKg, length, height, width) =
  local deck = height * 0.6;
  local z(half) = [-half, half];
  k.compound(id, massKg, [
    box('foot', 'trim', [-length / 2 + 0.08, 0, -width / 2 + 0.08], [length / 2 - 0.08, 0.03125, width / 2 - 0.08]),
    k.prism('body', 'skin', [[-length / 2, 0.03125], [length / 2, 0.03125], [length / 2, deck * 0.6], [length / 2 - 0.2, deck], [-length / 2 + 0.2, deck], [-length / 2, deck * 0.6]], z(width / 2)),
    k.prism('deck', 'skin', [[-length / 2 + 0.24, deck], [length / 2 - 0.24, deck], [length / 2 - 0.42, height], [-length / 2 + 0.42, height]], z(width / 2 - 0.14)),
  ] + k.bothSides([
    box('vent', 'trim', [-length * 0.28, deck * 0.35, width / 2 - 0.02], [length * 0.28, deck * 0.7, width / 2 + 0.01]),
  ]), { skin: 'paint-white', trim: 'plastic-black' });
// z = 0 is the body's skin and +z points out, so the closed flap stands just proud of a near-side panel.
local chargePort = k.compound('charge_port', 1.5, [
  box('socket', 'trim', [-0.1, 0, -0.06], [0.1, 0.18, 0]),
  box('lid', 'lid', [-0.07, 0.03, 0], [0.07, 0.15, 0.03125]),
  box('bezel_low', 'trim', [-0.1, 0, 0], [0.1, 0.03, 0.0625]),
  box('bezel_high', 'trim', [-0.1, 0.15, 0], [0.1, 0.18, 0.0625]),
  box('bezel_rear', 'trim', [-0.1, 0.03, 0], [-0.07, 0.15, 0.0625]),
  box('bezel_front', 'trim', [0.07, 0.03, 0], [0.1, 0.15, 0.0625]),
  box('lamp', 'lamp', [-0.03125, 0.06, 0.03125], [0.03125, 0.12, 0.0625]),
], { trim: 'plastic-black', lid: 'paint-charcoal', lamp: 'plastic-green' });
local cabLamp(id, massKg, finish, depth, height, width) = k.compound(id, massKg, [
  box('lens', 'lens', [-depth / 2, 0, -width / 2], [depth / 2, height, width / 2]),
], { lens: finish });
local beacon(id, finish) = k.compound(id, 2, [
  box('foot', 'foot', [-0.1, 0, -0.1], [0.1, 0.03, 0.1]),
  k.turned('dome', 'lens', 'y', [[0, 0], [0, 0.09], [0.1, 0.08], [0.14, 0.04], [0.15, 0], [0, 0]], [0, 0.03, 0]),
], { foot: 'plastic-black', lens: finish });
// Lifts a `front_seat` 0.2 m: stands on the floor at the seat's own x and z, and the seat fits 0.2 above it.
local seatRiser = k.compound('seat_riser', 12, [
  box('base', 'plate', [-0.24, 0, -0.23], [0.24, 0.03, 0.23]),
  box('bellows', 'bellows', [-0.17, 0.03, -0.17], [0.17, 0.17, 0.17]),
  box('top', 'plate', [-0.24, 0.17, -0.23], [0.24, 0.2, 0.23]),
], { plate: 'steel-grey', bellows: 'rubber-black' });
// A low-floor bus's driver platform. y = 0 is its top, so it fits at the driver's seat position and reaches down to any
// floor up to 0.36 below; the long nose carries the gear lever ahead of the seat.
local seatPlinth = k.compound('seat_plinth', 30, [
  box('block', 'block', [-0.5, -0.36, -0.4], [0.44, -0.02, 0.4]),
  box('mat', 'mat', [-0.5, -0.02, -0.4], [0.44, 0, 0.4]),
], { block: 'paint-charcoal', mat: 'rubber-black' });
// Holds up a `steering_wheel`, which has no stem of its own: the foot is at y = 0, the wheel's hub fits at the top.
local steeringColumn(id, massKg, height) = k.compound(id, massKg, [
  box('tube', 'tube', [-0.04, 0, -0.03], [0.04, height, 0.03]),
], { tube: 'plastic-black' });
// Stands on a dash top: the dials face the driver at -x under the hood, centred on z.
local instrumentBinnacle = k.compound('instrument_binnacle', 2, [
  box('housing', 'shell', [-0.1, 0, -0.22], [0.12, 0.13, 0.22]),
  k.prism('hood', 'shell', [[-0.16, 0.13], [0.12, 0.13], [0.12, 0.17], [-0.12, 0.17]], [-0.22, 0.22]),
] + k.bothSides([
  box('dial', 'dial', [-0.125, 0.03125, 0.0625], [-0.1, 0.09375, 0.1875]),
]), { shell: 'plastic-black', dial: 'plastic-white' });
// Lies along x, head at +x, its underside at y = 0.
local stretcher = k.compound('stretcher', 16, [
  box('leg_fore', 'frame', [0.72, 0, -0.26], [0.78, 0.36, 0.26]),
  box('leg_aft', 'frame', [-0.78, 0, -0.26], [-0.72, 0.36, 0.26]),
  box('bed', 'frame', [-0.9, 0.36, -0.28], [0.9, 0.42, 0.28]),
  box('mattress', 'mattress', [-0.88, 0.42, -0.26], [0.88, 0.5, 0.26]),
  k.prism('backrest', 'mattress', [[0.4, 0.5], [0.88, 0.5], [0.88, 0.62]], [-0.26, 0.26]),
], { frame: 'steel-stainless', mattress: 'plastic-orange' });
local attendantSeat = k.compound('attendant_seat', 7, [
  box('pan', 'dark', [-0.24, 0, -0.22], [0.22, 0.08, 0.22]),
  box('cushion', 'seat', [-0.24, 0.08, -0.22], [0.22, 0.18, 0.22]),
  k.prism('back', 'seat', [[-0.3, 0.14], [-0.2, 0.14], [-0.24, 0.82], [-0.33, 0.82]], [-0.22, 0.22]),
], { dark: 'paint-charcoal', seat: 'cloth-seat' });
// A helicopter's stick: foot on the cockpit floor, the T grip across z.
local controlStick = k.compound('control_stick', 2, [
  k.turned('stick', 'dark', 'y', k.disc(0.02, 0, 0.5)) + { sides: 8 },
  box('grip', 'dark', [-0.03, 0.5, -0.24], [0.03, 0.56, 0.24]),
], { dark: 'plastic-black' });
local towHitch = k.compound('tow_hitch', 18, [
  box('bar', 'steel', [0, 0, -0.45], [0.06, 0.08, 0.45]),
  box('neck', 'steel', [-0.2, 0.02, -0.03], [0, 0.07, 0.03]),
  k.turned('ball', 'steel', 'y', [[0, 0], [0, 0.015], [0.03, 0.025], [0.06, 0.015], [0.07, 0], [0, 0]], [-0.2, 0.07, 0]),
], { steel: 'paint-charcoal' });
[
  wheel('wheel_165_70r13', 12, 0.165, 0.165, 0.281),
  wheel('wheel_235_75r15', 26, 0.235, 0.19, 0.367),
  wheel('wheel_225_75r16c', 28, 0.225, 0.203, 0.372),
  wheel('wheel_8r19_5', 48, 0.21, 0.248, 0.43),
  wheel('wheel_295_80r22_5', 85, 0.295, 0.286, 0.522),
  farmWheel('wheel_16_9r30', 160, 0.43, 0.381, 0.78, 24),
  farmWheel('wheel_11_2r24', 55, 0.284, 0.305, 0.57, 18),
  wheel('wheel_265_75r16', 32, 0.265, 0.203, 0.402),
  twinWheel('wheel_twin_225_75r16c', 60, 0.225, 0.203, 0.372),
  m.wheel('wheel_military_22_5', 95, 0.32, 0.286, 0.522, 26, 0.04, 'steel-parkerized'),
  m.wheel('wheel_military_16', 30, 0.19, 0.203, 0.37, 18, 0.04, 'steel-parkerized'),
  spareCarrier,
  farmWheel('wheel_6_50r16_ag', 24, 0.165, 0.203, 0.37, 14),
  wheel('wheel_145r10', 7, 0.145, 0.127, 0.23),
  inline('engine_i3_small', 85, 0.34, 0.42, 0.52),
  inline('engine_i4_petrol', 140, 0.46, 0.46, 0.55),
  inline('engine_i4_diesel', 185, 0.5, 0.5, 0.62),
  inline('engine_i6_diesel', 340, 0.86, 0.56, 0.75),
  inline('engine_i6_heavy_diesel', 640, 1.12, 0.72, 0.95),
  vee('engine_v6_petrol', 175, 0.5, 0.62, 0.6),
  vee('engine_v8_petrol', 260, 0.62, 0.72, 0.68),
  gearbox('gearbox_transaxle', 35, 0.3, 0.4, 0.3),
  gearbox('gearbox_inline', 48, 0.62, 0.28, 0.3),
  gearbox('gearbox_truck', 110, 0.72, 0.42, 0.42),
  gearbox('gearbox_heavy', 240, 0.95, 0.52, 0.55),
  radiator('radiator_small', 5, 0.62, 0.36),
  radiator('radiator_car', 7, 0.76, 0.42),
  radiator('radiator_van', 10, 0.82, 0.55),
  radiator('radiator_truck', 28, 0.9, 0.95),
  tank('fuel_tank_car', 9, 'polymer-black', 0.42, 0.6, 0.16),
  tank('fuel_tank_van', 14, 'polymer-black', 0.52, 0.72, 0.24),
  tank('fuel_tank_truck', 28, 'alu-bare', 0.9, 0.52, 0.52),
  exhaust('exhaust_car', 12, 2.2, 0.25, [0.42, 0.42]),
  exhaust('exhaust_rusted', 12, 2.2, 0.25, [0.42, 0.42], 'scrap-rusted', 'scrap-rusted'),
  exhaust('exhaust_long', 22, 3.6, 0.3, [0.56, 0.36]),
  exhaust('exhaust_small', 8, 2.2, 0.31, [0.3, 0.22]),
  exhaust('exhaust_bus_rear', 15, 0.62, 0.55, [0.5, 0.28]),
  exhaust('exhaust_military', 9, 1.4, 0.2, [0.4, 0.16], 'steel-spall-black'),
  exhaustSideHigh,
  strut('front_strut', 14),
  twistBeam('twist_beam', 30, 1.52),
  beamAxle('beam_axle_light', 75, 1.5, 0.0625, 0.37),
  beamAxle('beam_axle_van', 110, 1.68, 0.0625, 0.37),
  beamAxle('beam_axle_truck', 280, 1.86, 0.07, 0.52),
  steeredAxle('steered_axle_heavy', 240, 0.95, 0.52),
  steeredAxleMedium,
  steeredAxleDrop,
  trailerAxle('trailer_axle_light', 40, 1.5, 0.035, 0.37),
  trailerAxle('trailer_axle_van', 65, 1.68, 0.045, 0.37),
  trailerAxle('trailer_axle_truck', 190, 1.86, 0.065, 0.52),
  propShaft('prop_shaft_short', 10, 1.2),
  propShaft('prop_shaft_long', 22, 2.6),
  bench('bench_seat_2', 18, 1.0),
  bench('bench_seat_3', 26, 1.4),
  benchLow,
  panSeat,
  steeringWheelRaked,
  busSeat,
  busSeatSingle,
  busSeatCoach,
  crewBench,
  grabPole('grab_pole', 4, 2.3),
  grabPole('grab_pole_short', 3.5, 1.9),
  cabLamp('tail_lamp_small', 0.8, 'plastic-red', 0.06, 0.14, 0.18),
  cabLamp('tail_lamp_tall', 1.2, 'plastic-red', 0.06, 0.48, 0.14),
  cabLamp('marker_lamp', 0.3, 'plastic-yellow', 0.04, 0.06, 0.12),
  beacon('beacon_blue', 'plastic-blue'),
  beacon('beacon_amber', 'plastic-yellow'),
  towHitch,
  exhaustStack,
  exhaustStackSmall,
  roofVent,
  doorMirrorLarge,
  doorMirrorBus,
  doorMirrorBox,
  doorMirrorBright,
  headlampLarge,
  headlampMilitary,
  headlampRound,
  workLamp('work_lamp', 1),
  lightBarBlue,
  hybridBadge,
  hybridBadgeRear,
  doorStepWalkIn,
  rearStepTread,
  trailerCoupling,
  trailerLeg,
  jockeyWheel,
  truckBatteryTray,
  tractionMotor('traction_motor_light', 25, 0.1, 0.24),
  tractionMotor('traction_motor_car', 65, 0.15, 0.36),
  tractionMotor('traction_motor_large', 240, 0.25, 0.6),
  inverter('inverter_car', 14, 0.36, 0.14, 0.26),
  inverter('inverter_large', 45, 0.6, 0.24, 0.42),
  tractionPack('traction_pack_light', 70, 0.52, 0.2, 0.74),
  tractionPack('traction_pack_car', 300, 1.6, 0.11, 1.2),
  tractionPack('traction_pack_van', 500, 2.4, 0.16, 1.24),
  tractionPack('hybrid_pack', 45, 0.6, 0.11, 0.6),
  tractionPackRoof('traction_pack_roof', 2000, 4.2, 0.36, 1.5),
  tractionPackRoof('traction_pack_roof_small', 500, 2.4, 0.3, 1.24),
  chargePort,
  wheel('wheel_225_60r17', 26, 0.225, 0.216, 0.351),
  wheel('wheel_185r14', 16, 0.185, 0.178, 0.325),
  seatRiser,
  seatPlinth,
  steeringColumn('steering_column', 3, 0.28),
  steeringColumn('steering_column_short', 2, 0.15),
  instrumentBinnacle,
  stretcher,
  attendantSeat,
  controlStick,
]
