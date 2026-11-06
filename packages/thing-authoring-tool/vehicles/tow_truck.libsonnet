local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local s = import 'tow_truck.spec.libsonnet';
local finish = { yellow: 'paint-crane-yellow', frame: 'paint-charcoal', steel: 'steel-grey', alu: 'alu-bare', dark: 'plastic-black', rubber: 'rubber-black', reflect: 'reflective-yellow', chain: 'steel-hardened', white: 'paint-white', red: 'plastic-red' };
local slats = std.range(0, 3);
local lockerDoors = [-2.3, -1.1, 0.1, 1.2];
[
  k.compound('tow_truck_deck', 380, [
    box('plate', 'alu', [s.deckRear, s.deckBottom, -s.side], [s.deckFront, s.deckTop, s.side]),
  ] + [
    box('chevron_' + i, if i % 2 == 0 then 'red' else 'white', [s.deckRear - 0.02, s.deckBottom, -s.side + i * s.side / 3], [s.deckRear, s.deckTop, -s.side + (i + 1) * s.side / 3])
    for i in std.range(0, 5)
  ] + k.bothSides([
    box('runner', 'frame', [s.deckRear + 0.1, s.railTop, 0.3], [s.deckFront, s.deckBottom, 0.44]),
  ]), finish),
  k.compound('tow_truck_locker', 110, [
    box('case', 'frame', [-2.9, s.deckTop, s.lockerIn], [s.deckFront - 0.1, s.lockerTop, s.side]),
    box('lid', 'alu', [-2.92, s.lockerTop, s.lockerIn - 0.02], [s.deckFront - 0.08, s.lockerTop + 0.04, s.side + 0.01]),
    box('band', 'reflect', [-2.9, s.deckTop + 0.02, s.side], [s.deckFront - 0.1, s.deckTop + 0.1, s.side + 0.012]),
  ] + [
    box('handle_' + i, 'alu', [lockerDoors[i] - 0.14, s.lockerTop - 0.2, s.side], [lockerDoors[i] + 0.14, s.lockerTop - 0.14, s.side + 0.03])
    for i in std.range(0, 3)
  ], finish),
  k.compound('tow_truck_cab_guard', 40, [
    box('top', 'yellow', [s.deckFront - 0.1, 2.68, -s.side + 0.1], [s.deckFront, 2.78, s.side - 0.1]),
  ] + [
    box('bar_' + i, 'frame', [s.deckFront - 0.08, s.deckTop, -0.9 + i * 0.6 - 0.03], [s.deckFront - 0.02, 2.68, -0.9 + i * 0.6 + 0.03])
    for i in slats
  ] + k.bothSides([
    box('post', 'yellow', [s.deckFront - 0.1, s.deckTop, s.side - 0.2], [s.deckFront, 2.68, s.side - 0.1]),
  ]), finish),
  k.compound('tow_truck_mast', 170, [
    box('saddle', 'yellow', [s.pivot[0] - 0.42, s.deckTop, -0.36], [s.pivot[0] + 0.42, s.deckTop + 0.14, 0.36]),
    m.axleDisc('pin', 'steel', s.pivot[0], s.pivot[1], 0.07, [-0.3, 0.3], 12),
  ] + k.bothSides([
    m.bar('cheek', 'yellow', [s.pivot[0] + 0.3, s.deckTop + 0.14], [s.pivot[0], s.pivot[1] + 0.1], 0.3, [0.19, 0.26], 0.2),
    m.bar('cheek_aft', 'yellow', [s.pivot[0] - 0.36, s.deckTop + 0.14], [s.pivot[0], s.pivot[1] + 0.1], 0.2, [0.19, 0.26], 0.14),
  ]), finish),
  k.compound('tow_truck_boom', 420, [
    m.bar('box', 'yellow', s.pivot, s.stageEnd, 0.4, [-0.17, 0.17], 0.32),
    m.bar('collar', 'frame', [s.stageEnd[0] + 0.1, s.stageEnd[1] - 0.04], s.stageEnd, 0.36, [-0.19, 0.19]),
  ], finish),
  k.compound('tow_truck_boom_stage', 130, [
    m.bar('stage', 'steel', s.stageEnd, s.tip, 0.22, [-0.11, 0.11]),
    m.axleDisc('sheave', 'frame', s.tip[0] - 0.02, s.tip[1], 0.15, [-0.13, 0.13], 12),
    box('work_lamp', 'white', [s.tip[0] + 0.1, s.tip[1] + 0.1, -0.09], [s.tip[0] + 0.2, s.tip[1] + 0.19, 0.09]),
  ], finish),
  k.compound('tow_truck_boom_ram', 70, [
    m.bar('sleeve', 'frame', [-0.75, s.deckTop], [-1.08, 1.86], 0.16, [-0.08, 0.08]),
    m.bar('rod', 'steel', [-1.08, 1.86], [-1.3, 2.46], 0.09, [-0.045, 0.045]),
  ], finish),
  k.compound('tow_truck_winch', 95, [
    m.axleDisc('drum', 'dark', 0.9, s.deckTop + 0.3, 0.22, [-0.36, 0.36], 16),
    m.axleDisc('line', 'chain', 0.9, s.deckTop + 0.3, 0.24, [-0.2, 0.2], 16),
  ] + k.bothSides([
    box('stand', 'yellow', [0.72, s.deckTop, 0.36], [1.08, s.deckTop + 0.42, 0.42]),
  ]), finish),
  k.compound('tow_truck_line', 25, [
    m.bar('run_up', 'chain', [0.9, s.deckTop + 0.54], [s.pivot[0], s.pivot[1] + 0.24], 0.05, [-0.03, 0.03]),
    m.bar('run_out', 'chain', [s.pivot[0], s.pivot[1] + 0.24], [s.tip[0] - 0.02, s.tip[1] + 0.15], 0.05, [-0.03, 0.03]),
  ], finish),
  k.compound('tow_truck_sling', 65, [
    box('fall', 'chain', [s.slingX - 0.03, 1.46, -0.03], [s.slingX + 0.03, s.tip[1], 0.03]),
    box('block', 'yellow', [s.slingX - 0.08, 1.28, -0.1], [s.slingX + 0.08, 1.46, 0.1]),
    box('spreader', 'frame', [s.slingX - 0.05, 1.18, -0.68], [s.slingX + 0.05, 1.28, 0.68]),
    box('cradle', 'rubber', [s.slingX - 0.08, 0.56, -0.86], [s.slingX + 0.08, 0.68, 0.86]),
  ] + k.bothSides([
    box('strap', 'rubber', [s.slingX - 0.05, 0.68, 0.56], [s.slingX + 0.05, 1.18, 0.66]),
    box('wheel_stop', 'frame', [s.slingX - 0.1, 0.68, 0.76], [s.slingX + 0.04, 0.78, 0.86]),
  ]), finish),
  k.compound('tow_truck_stabiliser', 45, [
    box('sleeve', 'yellow', [-3.33, 0.62, 0.8], [-3.17, s.deckBottom, 0.96]),
    box('leg', 'steel', [-3.3, 0.44, 0.83], [-3.2, 0.62, 0.93]),
    box('foot', 'frame', [-3.42, 0.38, 0.72], [-3.08, 0.44, 1.04]),
  ], finish),
]
