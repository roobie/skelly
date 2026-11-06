local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local box = k.box;
local turned = k.turned;
local s = import 'tanker_truck.spec.libsonnet';
local at = [0, s.barrelY, 0];
local finish = { tank: 'steel-bright', band: 'steel-grey', frame: 'paint-charcoal', paint: s.paint, pipe: 'steel-galvanised', tread: 'alu-bare', valve: 'paint-red', hose: 'rubber-black' };
local bands = [s.barrelRear + 0.45 + i * (s.barrelFront - s.barrelRear - 0.9) / 4 for i in std.range(0, 4)];
local saddles = [s.barrelRear + 1.0, -0.65, s.barrelFront - 0.55];
local manholes = [s.barrelRear + 1.2, (s.barrelRear + s.barrelFront) / 2, s.barrelFront - 1.2];
local ladderX = s.barrelRear - s.dish - 0.1;
local posts = [s.barrelRear + 0.5 + i * (s.barrelFront - s.barrelRear - 1.0) / 5 for i in std.range(0, 5)];
t.rows('tanker_truck', s) + [
  k.compound('tanker_truck_barrel', 2500, [
    turned('shell', 'tank', 'x', [
      [s.barrelRear - s.dish, 0],
      [s.barrelRear - s.dish, s.barrelRadius * 0.55],
      [s.barrelRear - s.dish * 0.45, s.barrelRadius * 0.88],
      [s.barrelRear, s.barrelRadius],
      [s.barrelFront, s.barrelRadius],
      [s.barrelFront + s.dish * 0.45, s.barrelRadius * 0.88],
      [s.barrelFront + s.dish, s.barrelRadius * 0.55],
      [s.barrelFront + s.dish, 0],
      [s.barrelRear - s.dish, 0],
    ], at) + { sides: 24 },
  ] + [
    turned('band_' + i, 'band', 'x', k.annulus(s.barrelRadius - 0.04, s.barrelRadius + 0.025, bands[i] - 0.04, bands[i] + 0.04), at) + { sides: 24 }
    for i in std.range(0, 4)
  ] + [
    turned('manhole_' + i, 'band', 'y', k.disc(0.3, s.barrelY + s.barrelRadius - 0.08, s.walkY + 0.1), [manholes[i], 0, 0]) + { sides: 12 }
    for i in std.range(0, 2)
  ], finish),
  k.compound('tanker_truck_saddle', 240, std.flattenArrays([
    [
      box('foot_' + i, 'frame', [saddles[i] - 0.16, s.railTop, -0.56], [saddles[i] + 0.16, s.railTop + 0.08, 0.56]),
      box('low_' + i, 'frame', [saddles[i] - 0.1, s.railTop + 0.08, -0.92], [saddles[i] + 0.1, 1.5, 0.92]),
      box('high_' + i, 'frame', [saddles[i] - 0.1, 1.5, -0.74], [saddles[i] + 0.1, 1.76, 0.74]),
    ]
    for i in std.range(0, 2)
  ]), finish),
  k.compound('tanker_truck_walkway', 95, [
    box('tread', 'tread', [s.barrelRear + 0.2, s.walkY, -0.24], [s.barrelFront - 0.2, s.walkY + 0.03, 0.24]),
  ] + [
    box('bearer_' + i, 'band', [posts[i] - 0.03, s.walkY - 0.09, -0.38], [posts[i] + 0.03, s.walkY, 0.38])
    for i in std.range(0, 5)
  ] + k.bothSides([
    box('rail', 'band', [s.barrelRear + 0.5, s.railY, 0.36], [s.barrelFront - 0.5, s.railY + 0.04, 0.4]),
  ] + [
    box('post_' + i, 'band', [posts[i] - 0.02, s.walkY - 0.12, 0.36], [posts[i] + 0.02, s.railY, 0.4])
    for i in std.range(0, 5)
  ]), finish),
  k.compound('tanker_truck_ladder', 26, k.bothSides([
    box('stile', 'band', [ladderX, s.railTop, 0.36], [ladderX + 0.04, s.walkY + 0.32, 0.4]),
    box('stay_low', 'band', [ladderX + 0.04, s.barrelY - 0.3, 0.36], [s.barrelRear - s.dish + 0.04, s.barrelY - 0.26, 0.4]),
    box('stay_high', 'band', [ladderX + 0.04, s.barrelY + 0.26, 0.36], [s.barrelRear - s.dish + 0.04, s.barrelY + 0.3, 0.4]),
  ]) + [
    box('rung_' + i, 'band', [ladderX, s.railTop + 0.4 + i * 0.3, -0.36], [ladderX + 0.04, s.railTop + 0.43 + i * 0.3, 0.36])
    for i in std.range(0, 7)
  ], finish),
  k.compound('tanker_truck_valve_gear', 180, [
    turned('rear_outlet', 'pipe', 'x', k.disc(0.08, s.barrelRear - s.dish - 0.1, s.barrelRear + 0.4), [0, 1.42, 0.5]),
    turned('rear_outlet_far', 'pipe', 'x', k.disc(0.08, s.barrelRear - s.dish - 0.1, s.barrelRear + 0.4), [0, 1.42, -0.5]),
    box('rear_valve', 'valve', [s.barrelRear - s.dish - 0.05, 1.33, 0.4], [s.barrelRear - s.dish + 0.08, 1.51, 0.6]),
    box('rear_valve_far', 'valve', [s.barrelRear - s.dish - 0.05, 1.33, -0.6], [s.barrelRear - s.dish + 0.08, 1.51, -0.4]),
    turned('manifold', 'pipe', 'x', k.disc(0.07, s.barrelRear + 0.4, -0.2), [0, 1.3, 0.72]),
    box('cabinet', 'paint', [-0.55, 0.92, 0.72], [0.55, 1.5, 1.22]),
    box('cabinet_door', 'tread', [-0.5, 0.97, 1.22], [0.5, 1.45, 1.235]),
    box('cabinet_handle', 'frame', [-0.08, 1.2, 1.235], [0.08, 1.24, 1.25]),
    box('cabinet_bracket', 'frame', [-0.2, 0.86, 0.44], [0.2, 0.92, 1.1]),
    turned('hose_tube', 'tread', 'x', k.disc(0.08, 0.8, 1.72), [0, 1.2, 1.12]),
    turned('hose_tube_far', 'tread', 'x', k.disc(0.08, -1.25, 0.9), [0, 1.2, -1.12]),
    turned('hose_cap', 'hose', 'x', k.disc(0.09, 1.72, 1.76), [0, 1.2, 1.12]),
    turned('hose_cap_far', 'hose', 'x', k.disc(0.09, -1.29, -1.25), [0, 1.2, -1.12]),
    box('tube_hanger_a', 'frame', [0.95, 1.12, 0.44], [1.03, 1.17, 1.12]),
    box('tube_hanger_b', 'frame', [1.5, 1.12, 0.44], [1.58, 1.17, 1.12]),
    box('tube_hanger_far_a', 'frame', [-1.1, 1.12, -1.12], [-1.02, 1.17, -0.44]),
    box('tube_hanger_far_b', 'frame', [0.7, 1.12, -1.12], [0.78, 1.17, -0.44]),
  ], finish),
]
