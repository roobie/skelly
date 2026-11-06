local h = import '../compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;

// A closed ring turned about y from `y0` to `y0 + ht`, radii `r0` to `r1`: rims, bands and gorget lames.
local ring(id, slot, y0, ht, r0, r1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [ht, r1], [ht, r0], [0, r0]], [x, y0, z]);
// A hollow shell turned about y from an outside path of [y, r] points running from the rim up to the crown (ending on
// the axis), returned down the inside `t` lower and in, so the helmet stays open underneath.
local shell(id, slot, outside, t, origin=null) =
  local n = std.length(outside);
  local inside = [[outside[n - 1 - i][0] - t, std.max(0, outside[n - 1 - i][1] - (if outside[n - 1 - i][1] == 0 then 0 else t))] for i in std.range(0, n - 1)];
  h.turned(id, slot, 'y', outside + inside + [outside[0]], origin);
// The radius of an outside path of [y, r] points at height y, by straight runs between its points.
local radiusAt(path, y) =
  local n = std.length(path);
  local seg = [i for i in std.range(0, n - 2) if path[i][0] <= y && y <= path[i + 1][0]];
  if std.length(seg) == 0 then (if y < path[0][0] then path[0][1] else path[n - 1][1])
  else
    local i = seg[0], a = path[i], b = path[i + 1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
// A part-round shell between bearings a0 and a1 (0 is +z, the front), stacked from flat arcs, one per run of a [y, r]
// path, `t` thick inward and centred on [0, cz]: visors, bevors, neck guards and ear guards.
local arcShell(prefix, slot, path, t, a0, a1, steps, cz=0) = std.flattenArrays([
  local r = (path[i][1] + path[i + 1][1]) / 2;
  h.crescent('%s-%d' % [prefix, i], slot, r - t, r, a0, a1, steps, path[i][0], path[i + 1][0], 0, cz)
  for i in std.range(0, std.length(path) - 2)
]);
// The outside of a sphere centred at height cy, radius R, from bearing-free height y0 to its top, as a [y, r] path.
local spherePath(cy, R, y0, n=8) =
  local p0 = std.asin(std.max(-1, std.min(1, (y0 - cy) / R)));
  [[cy + R * std.sin(p0 + (std.pi / 2 - p0) * i / n), R * std.cos(p0 + (std.pi / 2 - p0) * i / n)] for i in std.range(0, n)];
// A raised strip `t` proud and `w` wide laid over a [y, r] path in the front-back plane (plane 'z') or the side plane
// (plane 'x'), on one side (`sign`): combs, crossing bands and ribs.
local rib(prefix, slot, path, t, w, plane, sign, cz=0) = [
  local a = path[i], b = path[i + 1];
  local pts = [[a[0], a[1]], [b[0], b[1]], [b[0], b[1] + t], [a[0], a[1] + t]];
  if plane == 'z' then h.prism('%s-%d' % [prefix, i], slot, 'x', [[p[0], cz + sign * p[1]] for p in pts], -w / 2, w / 2)
  else h.prism('%s-%d' % [prefix, i], slot, 'z', [[sign * p[1], p[0]] for p in pts], cz - w / 2, cz + w / 2)
  for i in std.range(0, std.length(path) - 2)
];
// A comb standing `ht` proud of a sphere of radius R centred at height cy, in the front-back plane, from bearing a0 to
// a1 degrees (0 is straight up, positive toward +z), `w` wide.
local comb(prefix, slot, cy, R, ht, a0, a1, w, steps=10) = [
  local p(r, k) = local a = rad(a0 + (a1 - a0) * k / steps); [cy + r * std.cos(a), r * std.sin(a)];
  h.prism('%s-%d' % [prefix, i], slot, 'x', [p(R - 0.003, i), p(R + ht, i), p(R + ht, i + 1), p(R - 0.003, i + 1)], -w / 2, w / 2)
  for i in std.range(0, steps - 1)
];
// A rivet head on the outside of a round shell at bearing `b` and height y, radius r from the axis.
local rivet(id, slot, r, b, y, s=0.007, cz=0) =
  local x = r * std.sin(rad(b)), z = cz + r * std.cos(rad(b));
  box(id, slot, [x - s / 2, y - s / 2, z - s / 2], [x + s / 2, y + s / 2, z + s / 2]);
// A pivot boss on each side at height y, `r` across and standing out from x = ±x0.
local bosses(slot, x0, y, r=0.012, len=0.008) = [
  h.turned('boss-%d' % i, slot, 'x', [[0, 0], [0, r], [len, r], [len, 0]], [if i == 0 then x0 else -x0 - len, y, 0])
  for i in [0, 1]
];

// A close helm standing on its gorget edge, face on +z: a round skull with a comb, a neck guard round the back, a
// bevor over the chin and a two-part visor with an eye slit between them, pivoting on bosses at the temples. Sizes:
// 'light' is plain and close-fitting, 'heavy' has a tall comb, a brow reinforce and a second gorget lame. A raised
// visor lies up over the brow and leaves the face open between the bevor and the skull.
local closeHelm(id, mass, steel, weight, raised) =
  local heavy = weight == 'heavy', light = weight == 'light';
  local R = if light then 0.105 else 0.11, cy = 0.22, t = if heavy then 0.006 else 0.005;
  local skull = spherePath(cy, R, cy);
  local back = [[0.0, R + 0.012], [0.02, R + 0.002], [0.05, R - 0.022], [0.1, R - 0.022], [0.16, R - 0.008], [cy, R]];
  local bevor = [[0.0, R + 0.01], [0.02, R], [0.06, R - 0.01], [0.1, R + 0.002], [0.13, R + 0.008]];
  local vr = R + 0.012;
  local visorDown = arcShell('visor-low', 'steel', [[0.13, vr - 0.004], [0.17, vr], [0.208, vr]], t, -106, 106, 16, 0.014)
                    + arcShell('slit-l', 'steel', [[0.208, vr], [0.226, vr]], t, -106, -68, 4, 0.014)
                    + arcShell('slit-r', 'steel', [[0.208, vr], [0.226, vr]], t, 68, 106, 4, 0.014)
                    + arcShell('visor-up', 'steel', [[0.226, vr], [0.245, vr - 0.004], [0.265, R - 0.002]], t, -100, 100, 14)
                    + [box('lift', 'rivet', [0.03, 0.16, vr + 0.004], [0.05, 0.168, vr + 0.016])];
  // Raised, the visor lies over the brow a little proud of the skull, its slit edge at the top.
  local up(y) = std.sqrt(std.max(0, R * R - (y - cy) * (y - cy))) + 0.012;
  local visorUp = arcShell('visor-raised', 'steel', [[y, up(y)] for y in [0.228, 0.245, 0.262, 0.28, 0.296]], t, -84, 84, 14)
                  + [box('lift', 'rivet', [0.03, 0.232, up(0.232) - 0.004], [0.05, 0.24, up(0.232) + 0.008])];
  local combH = if heavy then 0.03 else if light then 0.008 else 0.018;
  h.compound(id, mass,
             [
               shell('skull', 'steel', skull, t),
               ring('skull-brim', 'steel', cy - 0.004, 0.01, R - t, R + 0.002),
             ]
             + arcShell('neck', 'steel', back, t, 92, 268, 14)
             + arcShell('bevor', 'steel', bevor, t, -106, 106, 16, 0.008)
             + (if raised then visorUp else visorDown)
             + bosses('rivet', R + (if raised then 0.008 else 0.012), cy - 0.004)
             + comb('comb', 'steel', cy, R, combH, -100, if raised then 40 else 72, 0.006, 12)
             + [h.prism('keel', 'steel', 'x', [[0.03, R], [0.03, R + 0.016], [0.13, R + 0.044]] + (if raised then [[0.13, R]] else [[0.195, R + 0.058], [0.206, R + 0.05], [0.206, R]]), -0.007, 0.007)]
             + [rivet('rivet-n-%d' % b, 'rivet', R + 0.006, b, 0.08, 0.006) for b in [130, 180, 230]]
             + (if heavy then
                  arcShell('brow', 'steel', [[cy + 0.005, R + 0.004], [cy + 0.035, std.sqrt(R * R - 0.035 * 0.035) + 0.004]], 0.006, -70, 70, 10)
                  + [ring('lame', 'steel', 0, 0.022, R - 0.002, R + 0.016)]
                else [])
             + (if light then [] else [rivet('rivet-b-%d' % b, 'rivet', R + 0.008, b, 0.03, 0.006, 0.004) for b in [-60, -30, 30, 60]]),
             { steel: steel, rivet: 'steel-bright' })
  + { voxelGrain: 0.004 };

// Shapes shared by the open helmets.
local nasalPath = [[0.05, 0.1], [0.09, 0.101], [0.14, 0.09], [0.19, 0.06], [0.23, 0.026], [0.248, 0]];
local turbanPath = [[0.07, 0.104], [0.11, 0.111], [0.15, 0.104], [0.19, 0.084], [0.23, 0.052], [0.26, 0.022], [0.275, 0]];
local sheetPath = [[0, 0.106], [0.06, 0.108], [0.11, 0.1], [0.15, 0.078], [0.18, 0.044], [0.192, 0]];

[
  // A close helm of hardened steel with its visor raised, standing on its gorget edge, 256 mm across, 280 mm front
  // to back and 348 mm tall: the visor lies up over the brow and the face shows open above the bevor.
  closeHelm('ch_helm_close_raised', 3.5, 'steel-hardened', 'standard', true),
  // A plain light close helm of hardened steel, visor down, 248 mm across, 280 mm front to back and 332 mm tall.
  closeHelm('ch_lighthelm_close', 3.1, 'steel-hardened', 'light', false),
  // The light close helm with its visor raised, 240 mm across, 264 mm front to back and 332 mm tall.
  closeHelm('ch_lighthelm_close_raised', 3.1, 'steel-hardened', 'light', true),
  // A close helm of high-carbon steel, visor down, 260 mm across, 296 mm front to back and 348 mm tall.
  closeHelm('hc_helm_close', 3.6, 'steel-blued', 'standard', false),
  // A heavy close helm of high-carbon steel, visor down: a tall comb, a brow reinforce and a second gorget lame,
  // 260 mm across, 308 mm front to back and 360 mm tall.
  closeHelm('hc_heavyhelm_close', 4.6, 'steel-blued', 'heavy', false),
  // The heavy close helm with its visor raised, 256 mm across, 292 mm front to back and 360 mm tall.
  closeHelm('hc_heavyhelm_close_raised', 4.4, 'steel-blued', 'heavy', true),

  // A conical nasal helm of hardened steel set level on its nasal bar and leather chin straps, 216 mm across and
  // 248 mm tall: a pointed bowl with a riveted rim band, crossing bands over the crown and a bar down over the nose.
  h.compound('ch_helmet_nasal', 1.6,
             [
               shell('bowl', 'steel', nasalPath, 0.003),
               ring('rim', 'steel', 0.05, 0.022, 0.098, 0.106),
               ring('liner', 'leather', 0.052, 0.03, 0.09, 0.097),
               box('nasal', 'steel', [-0.013, 0, 0.1], [0.013, 0.075, 0.108]),
               box('nasal-tip', 'steel', [-0.009, 0, 0.1], [0.009, 0.01, 0.111]),
             ]
             + std.flattenArrays([rib('band-%s' % n[0], 'steel', [[p[0], p[1]] for p in nasalPath[1:]], 0.005, 0.02, n[1], n[2]) for n in [['f', 'z', 1], ['b', 'z', -1], ['l', 'x', 1], ['r', 'x', -1]]])
             + [rivet('rivet-%d' % b, 'rivet', 0.108, b, 0.061, 0.006) for b in [15 + 30 * k for k in std.range(0, 11)]]
             + [box('strap-%d' % i, 'leather', [s * 0.093 - 0.002, 0, -0.012], [s * 0.093 + 0.002, 0.06, 0.012]) for i in [0, 1] for s in [[1, -1][i]]],
             { steel: 'steel-hardened', rivet: 'steel-bright', leather: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A fluted turban helmet of hardened steel standing on its ear guards and nasal bar, 232 mm across and 312 mm tall:
  // a tall onion-shaped bowl twisted with spiral flutes, a spike finial, a banded rim, a sliding nasal bar in a
  // bracket over the brow and a curved guard over each ear.
  h.compound('ch_helmet_turban', 2.1,
             [
               shell('bowl', 'steel', turbanPath, 0.003),
               ring('rim', 'steel', 0.07, 0.03, 0.104, 0.112),
               h.turned('finial', 'steel', 'y', [[0, 0], [0, 0.016], [0.012, 0.012], [0.04, 0.003], [0.05, 0]], [0, 0.268, 0]),
               box('nasal', 'steel', [-0.008, 0.0, 0.113], [0.008, 0.16, 0.12]),
               box('bracket', 'rivet', [-0.016, 0.1, 0.11], [0.016, 0.118, 0.124]),
               box('nasal-stop', 'steel', [-0.012, 0.16, 0.113], [0.012, 0.168, 0.122]),
             ]
             + arcShell('ear-l', 'steel', [[0.0, 0.112], [0.04, 0.11], [0.08, 0.108]], 0.004, 62, 118, 6)
             + arcShell('ear-r', 'steel', [[0.0, 0.112], [0.04, 0.11], [0.08, 0.108]], 0.004, 242, 298, 6)
             // Twelve flutes climb from the rim to the crown, each turning 50 degrees on the way up.
             + std.flattenArrays([
               [
                 local y = 0.1 + 0.15 * i / 10, r = radiusAt(turbanPath, y + 0.0075);
                 h.crescent('flute-%d-%d' % [k, i], 'steel', r - 0.003, r + 0.005, k * 30 + 5 * i, k * 30 + 5 * i + 8, 1, y, y + 0.015)[0]
                 for i in std.range(0, 9)
               ]
               for k in std.range(0, 11)
             ]),
             { steel: 'steel-hardened', rivet: 'steel-bright' })
  + { voxelGrain: 0.004 },

  // A crude open-faced helmet hammered from hardened sheet steel, sitting on its rim, 240 mm across and 196 mm tall:
  // a deep bowl crossed by two riveted straps, a riveted brow band and a padded cotton lining showing at the rim.
  h.compound('ch_helmet_metal_sheets', 2.1,
             [
               shell('bowl', 'steel', sheetPath, 0.004),
               ring('band', 'steel', 0, 0.03, 0.104, 0.113),
               ring('lining', 'cloth', 0.004, 0.05, 0.088, 0.103),
               ring('lining-roll', 'cloth', 0, 0.012, 0.086, 0.106),
             ]
             + std.flattenArrays([rib('strap-%s' % n[0], 'steel', sheetPath[1:], 0.005, 0.03, n[1], n[2]) for n in [['f', 'z', 1], ['b', 'z', -1], ['l', 'x', 1], ['r', 'x', -1]]])
             + [rivet('rivet-band-%d' % b, 'rivet', 0.114, b, 0.015, 0.008) for b in [20, 70, 110, 160, 200, 250, 290, 340]]
             + [rivet('rivet-strap-%d-%d' % [b, k], 'rivet', radiusAt(sheetPath, [0.06, 0.12][k]) + 0.006, b, [0.06, 0.12][k], 0.008) for b in [0, 90, 180, 270] for k in [0, 1]],
             { steel: 'steel-hardened', rivet: 'steel-bright', cloth: 'cloth-canvas' })
  + { voxelGrain: 0.004 },

  // A flat-topped great helm of hardened sheet steel, the bucket kind, standing on its rim, 244 mm across and 300 mm
  // tall: a straight drum riveted at a seam, a shallow domed lid, two eye slits either side of a centre strap that
  // runs down the face as a cross, breathing holes low on the wearer's right and a cotton lining at the rim.
  local gr = 0.118, wall(prefix, y0, y1, a0, a1, n) = arcShell(prefix, 'steel', [[y0, gr], [y1, gr]], 0.006, a0, a1, n);
  h.compound('ch_helmet_metal_sheets_full', 3.2,
             wall('wall-low', 0, 0.09, 0, 360, 48)
             // Breathing holes low on the wearer's right, at bearings -50 to -14.
             + wall('breath-row', 0.09, 0.104, -14, 310, 40) + wall('breath-a', 0.09, 0.104, -44, -38, 1) + wall('breath-b', 0.09, 0.104, -32, -26, 1)
             + wall('breath-c', 0.09, 0.104, -20, -14, 1)
             + wall('wall-mid', 0.104, 0.19, 0, 360, 48)
             + wall('slit-back', 0.19, 0.206, 62, 298, 32) + wall('slit-bar', 0.19, 0.206, -7, 7, 1)
             + wall('wall-top', 0.206, 0.27, 0, 360, 48)
             + [
               h.dome('lid', 'steel', gr, 0.03, 0.004, 'y', [0, 0.27, 0]),
               ring('lid-rim', 'steel', 0.262, 0.012, gr - 0.002, gr + 0.004),
               ring('foot', 'steel', 0, 0.016, gr - 0.002, gr + 0.004),
               box('cross-v', 'steel', [-0.014, 0.016, gr - 0.002], [0.014, 0.262, gr + 0.005]),
               box('seam', 'steel', [-0.008, 0.016, -gr - 0.005], [0.008, 0.262, -gr + 0.002]),
               ring('lining', 'cloth', 0.004, 0.04, gr - 0.016, gr - 0.003),
             ]
             + arcShell('brow', 'steel', [[0.206, gr + 0.006], [0.226, gr + 0.006]], 0.008, -62, 62, 10)
             + [rivet('rivet-v-%d' % i, 'rivet', gr + 0.006, 0, 0.04 + 0.05 * i, 0.007) for i in [0, 1, 2]]
             + [rivet('rivet-s-%d' % i, 'rivet', gr + 0.006, 180, 0.04 + 0.05 * i, 0.007) for i in [0, 1, 2, 3, 4]]
             + [rivet('rivet-brow-%d' % b, 'rivet', gr + 0.01, b, 0.216, 0.006) for b in [-50, -25, 25, 50]],
             { steel: 'steel-hardened', rivet: 'steel-bright', cloth: 'cloth-canvas' })
  + { voxelGrain: 0.004 },

  // A traditional firefighter's helmet sitting on its brim, 304 mm front to back, 312 mm across and 196 mm tall: a
  // red domed crown with a ridge and side ribs, a brim short at the front and long and sloping at the back to shed
  // water, a brass edge, a brass holder on the brow and a black leather front shield with a white number plate.
  local cz = -0.02, crown = [[0.03, 0.102], [0.08, 0.1], [0.12, 0.086], [0.15, 0.06], [0.168, 0.03], [0.172, 0]];
  local brimR(b) = 0.12 + 0.06 * (1 - std.cos(rad(b))) / 2, brimY(b) = 0.026 * (1 + std.cos(rad(b))) / 2;
  h.compound('firehelmet', 1.2,
             [shell('crown', 'shell', crown, 0.005, [0, 0, cz])]
             + std.flattenArrays([
               local b = 15 * i, r = brimR(b + 7.5), y = brimY(b + 7.5);
               h.crescent('brim-%d' % i, 'shell', 0.096, r, b, b + 15, 1, y, y + 0.008, 0, cz)
               + h.crescent('edge-%d' % i, 'trim', r - 0.006, r + 0.002, b, b + 15, 1, y, y + 0.012, 0, cz)
               for i in std.range(0, 23)
             ])
             + rib('ridge-f', 'shell', crown[1:], 0.01, 0.014, 'z', 1, cz) + rib('ridge-b', 'shell', crown[1:], 0.01, 0.014, 'z', -1, cz)
             + rib('rib-l', 'shell', crown[1:5], 0.006, 0.01, 'x', 1, cz) + rib('rib-r', 'shell', crown[1:5], 0.006, 0.01, 'x', -1, cz)
             + [
               h.prism('shield', 'leather', 'z', [[-0.055, 0.03], [0.055, 0.03], [0.062, 0.13], [0.04, 0.17], [-0.04, 0.17], [-0.062, 0.13]], 0.086, 0.094),
               box('plate', 'plate', [-0.03, 0.08, 0.094], [0.03, 0.12, 0.098]),
               box('holder', 'trim', [-0.014, 0.15, 0.056], [0.014, 0.19, 0.094]),
               box('holder-head', 'trim', [-0.022, 0.175, 0.07], [0.022, 0.195, 0.096]),
             ],
             { shell: 'plastic-red', trim: 'brass-dull', leather: 'leather-black', plate: 'paint-white' })
  + { voxelGrain: 0.004 },
]
