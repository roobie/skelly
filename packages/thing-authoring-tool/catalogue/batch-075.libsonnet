local h = import '../compound.libsonnet';
local box = h.box;
local turned = h.turned;
local disc = h.disc;
// A solid of revolution along x from a list of [x, radius] stations, closed on its axis at both ends.
local alongX(id, slot, stations, y=0, z=0) = turned(id, slot, 'x', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]], [0, y, z]);
// A solid of revolution standing on y from a list of [y, radius] stations, closed on its axis at both ends.
local standing(id, slot, stations, x=0, z=0) = turned(id, slot, 'y', [[stations[0][0], 0]] + stations + [[stations[std.length(stations) - 1][0], 0]], [x, 0, z]);
// A flat plate lying on y from y0 to y1, outlined as [x, z] points.
local flat(id, slot, outline, y0, y1) = h.prism(id, slot, 'y', [[p[1], p[0]] for p in outline], y0, y1);
// A pair of scissors lying flat with the tips on +x and the pivot at x = 0: two crossed blades `reach` long and
// `width` deep opened a little, finger loops round (lx, ±lz) of radii r0 to r1, and shanks joining them to the pivot.
// `point` is the tip half-width: 0 for sharp tips, more for a child's rounded ones.
local scissors(reach, width, lx, lz, r0, r1, point) =
  local blade(id, side, y0, y1) = flat(id, 'blade', [
    [-0.006, -side * 0.002],
    [0.006, -side * (width * 0.45)],
    [reach - 0.004, side * (0.006 - point)],
    [reach, side * 0.008],
    [reach - 0.006, side * (0.010 + point)],
    [0.004, side * (width * 0.55)],
    [-0.006, side * 0.004],
  ], y0, y1);
  // A bar 8 mm wide from the pivot to the middle of the loop's inner edge.
  local shank(id, side) =
    local ex = lx + r0 * 0.5;
    local ez = side * (lz - r0 * 0.8);
    local len = std.sqrt(ex * ex + ez * ez);
    local nx = -ez / len * 0.004;
    local nz = ex / len * 0.004;
    flat(id, 'handle', [[nx, nz], [ex + nx, ez + nz], [ex - nx, ez - nz], [-nx, -nz]], 0, 0.007);
  [
    blade('blade-a', 1, 0.0035, 0.0055),
    blade('blade-b', -1, 0.0055, 0.0075),
    shank('shank-a', -1),
    shank('shank-b', 1),
    disc('pivot', 'pivot', 0.0035, 0.0025, 0.0085),
  ]
  + h.crescent('loop-a', 'handle', r0, r1, 0, 360, 12, 0, 0.007, lx, lz)
  + h.crescent('loop-b', 'handle', r0, r1, 0, 360, 12, 0, 0.007, lx, -lz);
[
  // A box-mod electronic cigarette 135 mm tall: a 24 by 40 by 85 mm battery body with a screen, fire button and two
  // adjust buttons on its +z face, and a clear tank with steel caps and a black drip tip on top.
  h.compound('advanced_ecig', 0.15, [
    box('mod', 'mod', [-0.012, 0, -0.020], [0.012, 0.085, 0.020]),
    box('screen', 'screen', [-0.008, 0.046, 0.020], [0.008, 0.060, 0.0215]),
    turned('fire', 'button', 'z', [[0, 0], [0, 0.0055], [0.002, 0.0055], [0.002, 0]], [0, 0.072, 0.020]),
    box('plus', 'button', [0.002, 0.036, 0.020], [0.007, 0.041, 0.0215]),
    box('minus', 'button', [-0.007, 0.036, 0.020], [-0.002, 0.041, 0.0215]),
    standing('base', 'steel', [[0.085, 0.011], [0.092, 0.011]]),
    standing('tank', 'tank', [[0.092, 0.0105], [0.118, 0.0105]]),
    standing('top', 'steel', [[0.118, 0.011], [0.125, 0.011], [0.127, 0.006]]),
    standing('drip', 'drip', [[0.127, 0.005], [0.134, 0.0045], [0.136, 0.003]]),
  ], { mod: 'alu-anodized-black', screen: 'screen-black', button: 'steel-stainless', steel: 'steel-stainless', tank: 'plastic-clear', drip: 'plastic-black' })
  + h.inHand('advanced_ecig', 'mod') + { voxelGrain: 0.002 },

  // A personal water filter straw 225 mm long and 30 mm across: a blue tube with a grey band, a black mouthpiece cap
  // at +x and a black intake cap at -x.
  h.compound('water_filter_straw', 0.065, [
    alongX('intake', 'cap', [[-0.1125, 0.013], [-0.110, 0.0155], [-0.090, 0.0155]]),
    alongX('body', 'body', [[-0.090, 0.015], [0.085, 0.015]]),
    alongX('band', 'band', [[-0.020, 0.0155], [0.000, 0.0155]]),
    alongX('mouth', 'cap', [[0.085, 0.0155], [0.100, 0.0155], [0.108, 0.010], [0.1125, 0.009]]),
  ], { body: 'plastic-blue', band: 'plastic-grey', cap: 'plastic-black' })
  + { handling: h.gripOn('water_filter_straw', 'body'), voxelGrain: 0.002 },

  // A straight glass stem 120 mm long and 8 mm across ending in a 26 mm bulb with an open hole on top.
  h.compound('crackpipe', 0.01, [
    alongX('stem', 'glass', [[-0.070, 0.0035], [-0.068, 0.004], [0.040, 0.004]]),
    h.ball('bulb', 'glass', 0.013, 0.050, 0, 0),
    disc('hole', 'hole', 0.004, 0.0115, 0.0132, 0.050, 0),
    disc('soot', 'soot', 0.008, -0.005, 0.005, 0.050, 0),
  ], { glass: 'glass-clear', hole: 'coal-black', soot: 'plastic-scorched' })
  + { handling: h.gripOn('crackpipe', 'stem'), voxelGrain: 0.002 },

  // A hand-blown spoon pipe 110 mm long: a clear glass body swelling to 32 mm at the bowl end, green swirls, a bowl
  // on top with a dark hole and a carb hole on the +z side.
  h.compound('pipe_glass', 0.062, [
    alongX('body', 'glass', [[-0.055, 0.005], [-0.040, 0.007], [0.000, 0.011], [0.025, 0.015], [0.045, 0.014], [0.055, 0.008]]),
    alongX('swirl-a', 'swirl', [[-0.020, 0.0094], [-0.014, 0.0098]]),
    alongX('swirl-b', 'swirl', [[0.006, 0.0118], [0.012, 0.0126]]),
    alongX('mouth', 'swirl', [[-0.0555, 0.0045], [-0.050, 0.0058]]),
    disc('bowl', 'glass', 0.011, 0.010, 0.017, 0.030, 0),
    disc('bowl-hole', 'hole', 0.0065, 0.017, 0.0175, 0.030, 0),
    turned('carb', 'hole', 'z', [[0, 0], [0, 0.002], [0.001, 0.002], [0.001, 0]], [0.008, 0.002, 0.0115]),
  ], { glass: 'glass-clear', swirl: 'glass-lens-green', hole: 'coal-black' })
  + h.inHand('pipe_glass', 'body') + { voxelGrain: 0.002 },

  // A carved briar tobacco pipe 150 mm long: a 34 mm bowl 45 mm tall at +x with a charred hole, a round shank and a
  // tapering black stem with a flat bit at -x.
  h.compound('pipe_tobacco', 0.04, [
    standing('bowl', 'wood', [[0, 0.010], [0.008, 0.015], [0.040, 0.017], [0.045, 0.0165]], 0.035, 0),
    disc('char', 'char', 0.0115, 0.0445, 0.0455, 0.035, 0),
    alongX('shank', 'wood', [[-0.030, 0.0065], [0.025, 0.0075]], 0.012),
    alongX('ferrule', 'band', [[-0.033, 0.0068], [-0.030, 0.0068]], 0.012),
    alongX('stem', 'stem', [[-0.098, 0.004], [-0.090, 0.0045], [-0.033, 0.0058]], 0.012),
  ], { wood: 'wood-walnut', char: 'coal-black', band: 'brass-polished', stem: 'lacquer-black' })
  + { handling: h.gripOn('pipe_tobacco', 'shank'), voxelGrain: 0.002 },

  // A desktop single-hole punch 90 by 45 mm and 42 mm tall: a charcoal base, an aluminium punch housing at +x cut by a
  // dark paper slot, and a bright steel lever rising from its hinge to a black grip pad at -x.
  h.compound('office_holepunch', 0.16, [
    box('base', 'body', [-0.045, 0, -0.0225], [0.045, 0.005, 0.0225]),
    box('foot', 'pad', [-0.044, -0.0015, -0.021], [0.044, 0, 0.021]),
    box('housing', 'housing', [0.012, 0.005, -0.012], [0.040, 0.010, 0.012]),
    box('slot', 'slot', [0.0115, 0.010, -0.0125], [0.0405, 0.0125, 0.0125]),
    standing('column', 'housing', [[0.0125, 0.012], [0.030, 0.011]], 0.026, 0),
    standing('punch', 'pin', [[0.030, 0.004], [0.034, 0.004]], 0.026, 0),
    h.prism('lever', 'lever', 'z', [[0.040, 0.030], [0.040, 0.036], [-0.040, 0.042], [-0.044, 0.038], [-0.040, 0.034]], -0.010, 0.010),
    h.prism('grip', 'pad', 'z', [[-0.030, 0.0405], [-0.044, 0.0415], [-0.046, 0.0385], [-0.032, 0.0375]], -0.011, 0.011),
  ], { body: 'plastic-charcoal', housing: 'alu-bare', lever: 'steel-bright', pad: 'plastic-black', slot: 'coal-black', pin: 'steel-stainless' })
  + h.inHand('office_holepunch', 'base') + { voxelGrain: 0.002 },

  // A metal ballpoint 130 mm long and 9.6 mm across: a steel barrel with a band, a ribbed grip tapering to a cone and
  // the writing tip at +x, and a pocket clip and push button at -x.
  h.compound('pen', 0.025, [
    alongX('button', 'button', [[-0.065, 0.0025], [-0.060, 0.003]]),
    alongX('barrel', 'body', [[-0.060, 0.0048], [0.032, 0.0048]]),
    alongX('band', 'band', [[-0.004, 0.0050], [0.000, 0.0050]]),
    alongX('grip', 'grip', [[0.032, 0.0046], [0.050, 0.0042]]),
    alongX('cone', 'body', [[0.050, 0.0042], [0.061, 0.0015]]),
    alongX('tip', 'tip', [[0.061, 0.0012], [0.065, 0.0004]]),
    box('clip', 'clip', [-0.058, 0.0045, -0.0015], [-0.022, 0.0065, 0.0015]),
    box('clip-end', 'clip', [-0.024, 0.0045, -0.0018], [-0.020, 0.0072, 0.0018]),
  ], { body: 'steel-stainless', band: 'metal-gold', grip: 'rubber-black', tip: 'steel-grey', clip: 'steel-stainless', button: 'steel-stainless' })
  + { handling: h.gripOn('pen', 'barrel'), voxelGrain: 0.002 },

  // Office scissors 180 mm long: 115 mm pointed steel blades opened a little and black plastic finger loops.
  h.compound('scissors', 0.053, scissors(0.122, 0.016, -0.042, 0.017, 0.010, 0.0165, 0), {
    blade: 'steel-stainless', handle: 'plastic-black', pivot: 'steel-grey',
  }) + { handling: h.gripOn('scissors', 'shank-a'), voxelGrain: 0.002 },

  // Child's scissors 130 mm long: short blades with rounded tips and bright red finger loops.
  h.compound('scissors_child', 0.04, scissors(0.084, 0.014, -0.032, 0.014, 0.008, 0.0135, 0.002), {
    blade: 'steel-grey', handle: 'plastic-red', pivot: 'steel-stainless',
  }) + { handling: h.gripOn('scissors_child', 'shank-a'), voxelGrain: 0.002 },
]
