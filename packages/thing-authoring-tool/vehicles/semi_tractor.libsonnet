local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local s = t.spec(import 'semi_tractor.spec.libsonnet');
local finish = { paint: s.paint, frame: 'paint-charcoal', steel: 'steel-grey', chrome: 'steel-bright', trim: 'plastic-black', glass: 'glass-clear', tread: 'alu-bare', red: 'plastic-red', yellow: 'plastic-yellow', grease: 'rubber-black', bunk: 'cloth-seat' };
local coilY = s.floor + 0.28;
t.rows('semi_tractor', s) + [
  k.compound('semi_tractor_sleeper', 480, [
    box('floor', 'frame', [s.sleeperBack, s.floor - 0.05, -s.side], [s.cabBack, s.floor, s.side]),
    box('rear_wall', 'paint', [s.sleeperBack, s.floor - 0.05, -s.side], [s.sleeperBack + 0.05, s.roof + 0.11, s.side]),
    box('roof', 'paint', [s.sleeperBack, s.roof + 0.06, -s.side + 0.02], [s.cabBack, s.roof + 0.11, s.side - 0.02]),
    box('bunk', 'bunk', [s.sleeperBack + 0.05, s.floor + 0.36, -s.side + 0.05], [s.cabBack, s.floor + 0.5, s.side - 0.05]),
  ] + k.bothSides([
    box('wall_low', 'paint', [s.sleeperBack, s.low, s.side - 0.05], [s.cabBack, s.roof - 0.35, s.side]),
    box('wall_high', 'paint', [s.sleeperBack, s.roof - 0.1, s.side - 0.05], [s.cabBack, s.roof + 0.11, s.side]),
    box('wall_rear', 'paint', [s.sleeperBack, s.roof - 0.35, s.side - 0.05], [s.sleeperBack + 0.45, s.roof - 0.1, s.side]),
    box('wall_fore', 'paint', [s.cabBack - 0.14, s.roof - 0.35, s.side - 0.05], [s.cabBack, s.roof - 0.1, s.side]),
    box('window', 'glass', [s.sleeperBack + 0.45, s.roof - 0.35, s.side - 0.04], [s.cabBack - 0.14, s.roof - 0.1, s.side - 0.02]),
    box('locker', 'frame', [s.sleeperBack + 0.14, s.floor - 0.42, s.side], [s.cabBack - 0.14, s.floor - 0.05, s.side + 0.008]),
  ]), finish),
  k.compound('semi_tractor_fairing', 70, [
    prism('shell', 'paint', [[s.sleeperBack, s.roof + 0.11], [s.face - s.lean - 0.2, s.roof + 0.11], [s.cabBack + 0.08, s.fairingTop], [s.sleeperBack, s.fairingTop]], [-s.side + 0.04, s.side - 0.04]),
  ], finish),
  k.compound('semi_tractor_fifth_wheel', 190, [
    k.turned('plate', 'steel', 'y', k.disc(0.46, s.fifthTop - 0.07, s.fifthTop), [s.fifthX, 0, 0]) + { sides: 16 },
    box('throat', 'grease', [s.fifthX - 0.47, s.fifthTop - 0.02, -0.06], [s.fifthX + 0.04, s.fifthTop + 0.004, 0.06]),
    box('lock', 'grease', [s.fifthX + 0.02, s.fifthTop - 0.02, -0.1], [s.fifthX + 0.16, s.fifthTop + 0.004, 0.1]),
    box('handle', 'red', [s.fifthX - 0.02, s.fifthTop - 0.14, 0.44], [s.fifthX + 0.02, s.fifthTop - 0.1, 1.04]),
  ] + k.bothSides([
    box('base', 'frame', [s.fifthX - 0.36, s.railTop, 0.28], [s.fifthX + 0.36, s.fifthTop - 0.07, 0.46]),
    box('ramp', 'frame', [s.rear + 0.06, s.railTop, 0.34], [s.rearAxles[1] + 0.24, s.railTop + 0.14, 0.44]),
  ]), finish),
  k.compound('semi_tractor_stack', 60, k.bothSides([
    k.turned('pipe', 'chrome', 'y', k.disc(0.075, s.railTop, 3.82), [s.sleeperBack - 0.12, 0, 1.0]) + { sides: 12 },
    k.turned('tip', 'chrome', 'y', k.disc(0.095, 3.82, 3.94), [s.sleeperBack - 0.12, 0, 1.0]) + { sides: 12 },
    box('heat_shield', 'chrome', [s.sleeperBack - 0.23, 1.9, 1.075], [s.sleeperBack - 0.01, 2.75, 1.09]),
    box('clamp_high', 'frame', [s.sleeperBack - 0.1, 2.8, 0.97], [s.sleeperBack, 2.86, 1.03]),
    box('clamp_low', 'frame', [s.sleeperBack - 0.1, 1.5, 0.97], [s.sleeperBack, 1.56, 1.03]),
    box('foot', 'frame', [s.sleeperBack - 0.2, s.railTop - 0.04, 0.44], [s.sleeperBack - 0.04, s.railTop, 1.08]),
  ]), finish),
  k.compound('semi_tractor_catwalk', 75, [
    box('tread', 'tread', [s.sleeperBack - 0.5, s.railTop + 0.02, -0.92], [s.sleeperBack, s.railTop + 0.06, 0.92]),
    box('gantry', 'frame', [s.sleeperBack - 0.06, s.railTop + 0.06, -0.5], [s.sleeperBack, coilY + 0.1, 0.5]),
    k.turned('coil_a', 'red', 'x', k.annulus(0.05, 0.09, s.sleeperBack - 0.14, s.sleeperBack - 0.06), [0, coilY, 0.28]) + { sides: 12 },
    k.turned('coil_b', 'grease', 'x', k.annulus(0.05, 0.09, s.sleeperBack - 0.14, s.sleeperBack - 0.06), [0, coilY, 0]) + { sides: 12 },
    k.turned('coil_c', 'yellow', 'x', k.annulus(0.05, 0.09, s.sleeperBack - 0.14, s.sleeperBack - 0.06), [0, coilY, -0.28]) + { sides: 12 },
  ], finish),
]
