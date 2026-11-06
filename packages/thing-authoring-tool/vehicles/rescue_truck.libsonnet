local k = import 'kit.libsonnet';
local box = k.box;
local s = import 'rescue_truck.spec.libsonnet';
local finish = { paint: s.paint, white: 'paint-white', frame: 'paint-charcoal', steel: 'steel-grey', alu: 'alu-bare', dark: 'plastic-black', hivis: 'plastic-hivis', blue: 'plastic-blue', yellow: 'plastic-yellow', orange: 'plastic-orange', wood: 'wood-pine', lamp: 'plastic-frosted', reflect: 'reflective-yellow', red: 'plastic-red', galv: 'steel-galvanised' };
local beams = [-3.3, -2.4, -1.5, -0.6, 0.3];
local blocks = std.range(0, 11);
local blockX0 = s.bodyRear + 0.1;
local blockLength = (s.bodyFront - 0.1 - blockX0) / 12;
local slats = std.range(0, std.ceil((s.shutterTop - s.shutterLow - 0.1) / 0.09) - 1);
[
  k.compound('rescue_truck_racking', 1450, [
    box('racking', 'frame', [-3.3, s.bodyFloor, -0.82], [0.4, s.bodyTop - 0.1, 0.82]),
  ], finish),
  k.compound('rescue_truck_marking', 8, k.bothSides([
    box('block_' + i, if i % 2 == 0 then 'hivis' else 'blue', [blockX0 + i * blockLength, s.bodyTop - 0.28, s.bodySide], [blockX0 + (i + 1) * blockLength, s.bodyTop - 0.1, s.bodySide + 0.032])
    for i in blocks
  ]), finish),
  k.compound('rescue_truck_rear_shutter', 70, [
    box('bar', 'dark', [s.bodyRear - 0.03, s.shutterLow, -s.shutterSide], [s.bodyRear, s.shutterLow + 0.1, s.shutterSide]),
    box('head', 'frame', [s.bodyRear - 0.05, s.shutterTop, -s.shutterSide - 0.04], [s.bodyRear, s.shutterTop + 0.1, s.shutterSide + 0.04]),
  ] + [
    box('slat_' + i, if i % 2 == 0 then 'alu' else 'steel', [s.bodyRear - 0.03, s.shutterLow + 0.1 + i * 0.09, -s.shutterSide], [s.bodyRear, std.min(s.shutterLow + 0.1 + (i + 1) * 0.09, s.shutterTop), s.shutterSide])
    for i in slats
  ] + k.bothSides([
    box('guide', 'frame', [s.bodyRear - 0.05, s.shutterLow, s.shutterSide], [s.bodyRear, s.shutterTop, s.shutterSide + 0.04]),
  ] + [
    box('chevron_' + i, if i % 2 == 0 then 'red' else 'reflect', [s.bodyRear - 0.01, s.bodyFloor + i * 0.3, s.shutterSide + 0.04], [s.bodyRear, s.bodyFloor + (i + 1) * 0.3, s.bodySide])
    for i in std.range(0, 5)
  ]), finish),
  k.compound('rescue_truck_roof_rack', 170, [
    box('beam_' + i, 'frame', [beams[i] - 0.05, s.rackY - 0.05, -s.rackSide], [beams[i] + 0.05, s.rackY, s.rackSide])
    for i in std.range(0, std.length(beams) - 1)
  ] + [
    box('decking', 'galv', [s.rackRear, s.rackY, -s.rackSide], [s.rackFront, s.rackY + 0.03, s.rackSide]),
  ] + k.bothSides([
    box('rail', 'alu', [s.rackRear, s.rackY + 0.26, s.rackSide - 0.05], [s.rackFront, s.rackY + 0.31, s.rackSide]),
    box('rail_end_rear', 'alu', [s.rackRear, s.rackY + 0.26, 0], [s.rackRear + 0.05, s.rackY + 0.31, s.rackSide]),
    box('rail_end_front', 'alu', [s.rackFront - 0.05, s.rackY + 0.26, 0], [s.rackFront, s.rackY + 0.31, s.rackSide]),
  ] + std.flattenArrays([
    [
      box('stand_' + i, 'frame', [beams[i] - 0.04, s.bodyTop, s.rackSide - 0.1], [beams[i] + 0.04, s.rackY - 0.05, s.rackSide - 0.02]),
      box('upright_' + i, 'alu', [beams[i] - 0.025, s.rackY, s.rackSide - 0.05], [beams[i] + 0.025, s.rackY + 0.26, s.rackSide]),
    ]
    for i in std.range(0, std.length(beams) - 1)
  ])), finish),
  k.compound('rescue_truck_roof_gear', 320, [
    box('long_case', 'yellow', [-3.3, s.rackY + 0.03, 0.2], [-1.3, s.rackY + 0.36, 0.92]),
    box('long_case_lid', 'dark', [-3.3, s.rackY + 0.36, 0.2], [-1.3, s.rackY + 0.4, 0.92]),
    box('tool_case', 'orange', [-1.15, s.rackY + 0.03, 0.2], [-0.2, s.rackY + 0.42, 0.92]),
    box('tool_case_lid', 'dark', [-1.15, s.rackY + 0.42, 0.2], [-0.2, s.rackY + 0.46, 0.92]),
    box('cribbing_low', 'wood', [-3.3, s.rackY + 0.03, -0.92], [-2.0, s.rackY + 0.17, -0.2]),
    box('cribbing_high', 'wood', [-3.2, s.rackY + 0.17, -0.92], [-2.3, s.rackY + 0.31, -0.2]),
    box('strap_a', 'dark', [-3.05, s.rackY + 0.03, -0.92], [-2.95, s.rackY + 0.32, -0.2]),
    box('strap_b', 'dark', [-2.55, s.rackY + 0.03, -0.92], [-2.45, s.rackY + 0.32, -0.2]),
    box('stretcher_floor', 'orange', [-1.85, s.rackY + 0.03, -0.8], [0.25, s.rackY + 0.08, -0.26]),
  ] + [
    box('stretcher_side_a', 'orange', [-1.85, s.rackY + 0.08, -0.8], [0.25, s.rackY + 0.18, -0.75]),
    box('stretcher_side_b', 'orange', [-1.85, s.rackY + 0.08, -0.31], [0.25, s.rackY + 0.18, -0.26]),
    box('stretcher_end_a', 'orange', [-1.85, s.rackY + 0.08, -0.75], [-1.8, s.rackY + 0.18, -0.31]),
    box('stretcher_end_b', 'orange', [0.2, s.rackY + 0.08, -0.75], [0.25, s.rackY + 0.18, -0.31]),
  ], finish),
  k.compound('rescue_truck_light_mast', 90, [
    box('foot', 'frame', [s.mastX - 0.16, s.bodyTop, -0.16], [s.mastX + 0.0, s.bodyTop + 0.08, 0.16]),
    box('stage_a', 'white', [s.mastX - 0.13, s.bodyTop + 0.08, -0.1], [s.mastX - 0.03, 3.52, 0.1]),
    box('stage_b', 'steel', [s.mastX - 0.11, 3.52, -0.07], [s.mastX - 0.05, s.mastTop, 0.07]),
    box('head_bar', 'frame', [s.mastX - 0.12, s.mastTop, -0.72], [s.mastX - 0.04, s.mastTop + 0.08, 0.72]),
    box('lamp_a', 'frame', [s.mastX - 0.14, s.mastTop + 0.08, -0.72], [s.mastX, s.mastTop + 0.32, -0.3]),
    box('lamp_b', 'frame', [s.mastX - 0.14, s.mastTop + 0.08, 0.3], [s.mastX, s.mastTop + 0.32, 0.72]),
    box('glass_a', 'lamp', [s.mastX, s.mastTop + 0.1, -0.7], [s.mastX + 0.015, s.mastTop + 0.3, -0.32]),
    box('glass_b', 'lamp', [s.mastX, s.mastTop + 0.1, 0.32], [s.mastX + 0.015, s.mastTop + 0.3, 0.7]),
  ], finish),
  k.compound('rescue_truck_winch', 130, [
    box('cradle_base', 'frame', [s.front, 0.72, -0.42], [s.front + 0.26, 0.78, 0.42]),
    box('cheek_near', 'frame', [s.front, 0.78, 0.34], [s.front + 0.26, 1.0, 0.4]),
    box('cheek_far', 'frame', [s.front, 0.78, -0.4], [s.front + 0.26, 1.0, -0.34]),
    k.turned('drum', 'dark', 'z', k.disc(0.09, -0.34, 0.34), [s.front + 0.13, 0.89, 0]) + { sides: 12 },
    box('fairlead', 'steel', [s.front + 0.26, 0.82, -0.14], [s.front + 0.3, 0.96, 0.14]),
    box('hook', 'yellow', [s.front + 0.3, 0.86, -0.04], [s.front + 0.36, 0.94, 0.04]),
  ], finish),
]
