local h = import '../compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;

// Helmets as found on a shelf: standing upright on their rim or lowest edge, the face at +z.

// A closed ring turned about y from `y0` to `y0 + ht`, radii `r0` to `r1`, for brow bands, rims and beads.
local ring(id, slot, y0, ht, r0, r1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [ht, r1], [ht, r0], [0, r0]], [x, y0, z]);
// A hollow shell turned about y from an outside path of [y, r] points running from the rim up to the crown (ending
// on the axis), returned down the inside `t` lower and in, so the helmet stays open underneath.
local shell(id, slot, outside, t, y0=0) =
  local n = std.length(outside);
  local inside = [[outside[n - 1 - i][0] - t, std.max(0, outside[n - 1 - i][1] - (if outside[n - 1 - i][1] == 0 then 0 else t))] for i in std.range(0, n - 1)];
  h.turned(id, slot, 'y', outside + inside + [outside[0]], [0, y0, 0]);
// The radius of an outside path of [y, r] points at height y, by straight runs between its points.
local radiusAt(path, y) =
  local n = std.length(path);
  local seg = [i for i in std.range(0, n - 2) if path[i][0] <= y && y <= path[i + 1][0]];
  if std.length(seg) == 0 then (if y < path[0][0] then path[0][1] else path[n - 1][1])
  else
    local i = seg[0], a = path[i], b = path[i + 1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
// A wall of a shell between heights y0 and y1 (path heights, raised by `lift`) over [a0, a1] degrees (0 points to
// +z), `t` thick inward from the path: the parts of a shell either side of a window or a face opening.
local wallBand(prefix, slot, path, t, a0, a1, steps, y0, y1, lift=0, out=0) =
  local r = radiusAt(path, (y0 + y1) / 2) + out;
  h.crescent(prefix, slot, r - t, r, a0, a1, steps, y0 + lift, y1 + lift);
// Raised strips laid over a shell along its outside path, at bearing `a` degrees (0 points to +z), from path
// height y0 up to y1, `w` wide and standing `t` proud: ribs, seams, straps and crests.
local meridian(prefix, slot, path, a, y0, y1, w, t, steps=6, lift=0) = [
  local ya = y0 + (y1 - y0) * i / steps, yb = y0 + (y1 - y0) * (i + 1) / steps;
  local ra = radiusAt(path, ya), rb = radiusAt(path, yb), s = std.sin(rad(a)), c = std.cos(rad(a));
  // Each segment is the box round its corners, so ribs keep to the four cardinal bearings.
  local px = c, pz = -s;  // across the bearing
  local pt(r, y, side, off) = [y + lift, r * s + off * s + side * w / 2 * px, r * c + off * c + side * w / 2 * pz];
  local q = [pt(ra, ya, -1, -0.003), pt(ra, ya, 1, -0.003), pt(ra, ya, 1, t), pt(ra, ya, -1, t), pt(rb, yb, -1, -0.003), pt(rb, yb, 1, -0.003), pt(rb, yb, 1, t), pt(rb, yb, -1, t)];
  local xs = [p[1] for p in q], ys = [p[0] for p in q], zs = [p[2] for p in q];
  box('%s-%d' % [prefix, i], slot, [std.minArray(xs), std.minArray(ys), std.minArray(zs)], [std.maxArray(xs), std.maxArray(ys), std.maxArray(zs)])
  for i in std.range(0, steps - 1)
];
// The part of a shell between path heights ya and yb, turned about y as an open ring (or a cap when yb is the
// crown), `t` thick inward: the bands of a helmet above and below a window or an eye slit.
local shellPart(id, slot, path, t, ya, yb, lift=0) =
  local out = [[ya, radiusAt(path, ya)]] + [p for p in path if ya < p[0] && p[0] < yb] + [[yb, radiusAt(path, yb)]];
  local n = std.length(out);
  local inside = [[out[n - 1 - i][0], std.max(0, out[n - 1 - i][1] - t)] for i in std.range(0, n - 1)];
  h.turned(id, slot, 'y', out + inside + [out[0]], [0, lift, 0]);
// A rivet head on a shell at bearing `a` and path height y, standing out along the bearing.
local rivet(id, slot, path, a, y, r=0.005, lift=0) =
  local rr = radiusAt(path, y), s = std.sin(rad(a)), c = std.cos(rad(a));
  box(id, slot, [rr * s - r, y + lift - r, rr * c - r], [rr * s + r, y + lift + r, rr * c + r]);
local rivetRow(prefix, slot, path, y, n, r=0.005, lift=0, a0=0) = [rivet('%s-%d' % [prefix, i], slot, path, a0 + 360 * i / n, y, r, lift) for i in std.range(0, n - 1)];

// A skin laid over a shell between path heights y0 and y1 over [a0, a1] degrees, from `out - t` to `out` beyond the
// path, as `steps` stacked crescents that follow its slope: ribs at any bearing, lacing, visors, cloth covers.
local skin(prefix, slot, path, a0, a1, y0, y1, t, out, steps, lift=0, arcSteps=1) = std.flattenArrays([
  local ya = y0 + (y1 - y0) * i / steps, yb = y0 + (y1 - y0) * (i + 1) / steps, r = radiusAt(path, (ya + yb) / 2) + out;
  h.crescent('%s-%d' % [prefix, i], slot, std.max(0.001, r - t), r, a0, a1, arcSteps, ya + lift, yb + lift)
  for i in std.range(0, steps - 1)
]);
// A strip from [z, x] point `a` to `b`, `t` thick toward the centre, standing on y from y0 to y1.
local wall(id, slot, a, b, t, y0, y1) =
  local dz = b[0] - a[0], dx = b[1] - a[1], len = std.sqrt(dz * dz + dx * dx);
  local nz = dx / len * t, nx = -dz / len * t;
  h.prism(id, slot, 'y', [a, b, [b[0] + nz, b[1] + nx], [a[0] + nz, a[1] + nx]], y0, y1);
// The [z, x] point at bearing `a` degrees (0 points to +z) and radius r.
local polar(r, a) = [r * std.cos(rad(a)), r * std.sin(rad(a))];
// A ridge of slanted segments in the x-y plane, `w` wide, standing on z from z0 to z1, through [x, y] points:
// crests and horns.
local crest(prefix, slot, pts, w0, w1, z0, z1) = [
  local a = pts[i], b = pts[i + 1], n = std.length(pts) - 1;
  local dx = b[0] - a[0], dy = b[1] - a[1], len = std.sqrt(dx * dx + dy * dy);
  local wa = (w0 + (w1 - w0) * i / n) / 2, wb = (w0 + (w1 - w0) * (i + 1) / n) / 2, nx = -dy / len, ny = dx / len;
  h.prism('%s-%d' % [prefix, i], slot, 'z', [[a[0] - nx * wa, a[1] - ny * wa], [b[0] - nx * wb, b[1] - ny * wb], [b[0] + nx * wb, b[1] + ny * wb], [a[0] + nx * wa, a[1] + ny * wa]], z0, z1)
  for i in std.range(0, std.length(pts) - 2)
];

// Kettle helmet: a round steel bowl with a raised comb, on a wide brim sloping down to a rolled edge.
local kettleBowl = [[0, 0.104], [0.05, 0.104], [0.09, 0.094], [0.12, 0.072], [0.138, 0.04], [0.142, 0]];
// Nasal helm: a pointed iron cone on a brow band, with a nose bar hanging from the front.
local nasalPath = [[0, 0.102], [0.05, 0.1], [0.1, 0.082], [0.14, 0.05], [0.165, 0.016], [0.17, 0]];
// Skid lid: a low pudding-basin dome.
local skidPath = [[0, 0.098], [0.03, 0.097], [0.06, 0.085], [0.08, 0.06], [0.092, 0.03], [0.095, 0]];
// Helmet liner: a soft cloth skullcap.
local linerPath = [[0, 0.096], [0.05, 0.097], [0.085, 0.084], [0.11, 0.058], [0.124, 0.025], [0.127, 0]];

// Kabuto: a low ribbed iron bowl.
local kabutoBowl = [[0, 0.113], [0.04, 0.112], [0.08, 0.098], [0.105, 0.072], [0.12, 0.038], [0.124, 0]];
// Great helm: a flat-topped steel drum closed round the head.
local greatPath = [[0, 0.113], [0.25, 0.115], [0.278, 0.104], [0.292, 0.07], [0.297, 0]];
// Sheet metal helmets: a crude riveted bucket with a flat top.
local bucketPath = [[0, 0.118], [0.205, 0.118], [0.224, 0.106], [0.23, 0]];
// Full-face motorcycle helmet: a rounded shell, longest across its middle, closing in toward the neck.
local motorPath = [[0, 0.12], [0.04, 0.134], [0.1, 0.143], [0.17, 0.134], [0.22, 0.106], [0.255, 0.064], [0.27, 0.024], [0.273, 0]];

// A sheet metal bucket helmet standing on its bevor: a flared collar at the foot, a riveted bucket above with a
// padded cotton lining, and either the face cut out (`fullFace` false) or a closed front with an eye slit and
// breathing holes.
local sheetHelmet(id, mass, fullFace) =
  local lift = 0.06;
  local open = if fullFace then [lift + 0.088, lift + 0.104] else [lift, lift + 0.112];
  local span = if fullFace then 58 else 46;
  h.compound(id, mass,
             [
               h.turned('bevor', 'steel', 'y', [[0, 0.15], [lift + 0.004, 0.12], [lift + 0.004, 0.116], [0, 0.146], [0, 0.15]]),
               shellPart('top', 'steel', bucketPath, 0.003, open[1] - lift, 0.23, lift),
               ring('pad', 'pad', open[1] - 0.004, 0.024, 0.104, 0.115),
             ]
             + (if fullFace then [ring('pad-dark', 'shade', open[0] - 0.008, 0.032, 0.098, 0.112)]
                // The dark lining of the back wall, seen through the face opening.
                else h.crescent('lining', 'shade', 0.108, 0.114, span + 6, 360 - span - 6, 10, lift + 0.004, open[1]))
             + wallBand('side', 'steel', bucketPath, 0.003, span, 360 - span, 10, open[0] - lift, open[1] - lift, lift)
             + (if fullFace then [shellPart('foot', 'steel', bucketPath, 0.003, 0, open[0] - lift, lift)] else [])
             + (if fullFace then
                  wallBand('slit-bar', 'steel', bucketPath, 0.003, -3, 3, 1, open[0] - lift, open[1] - lift, lift)
                  + [rivet('hole-%d-%d' % [i, j], 'hole', bucketPath, -30 + 15 * i, 0.03 + 0.016 * j, 0.004, lift) for i in std.range(0, 4) for j in std.range(0, 2)]
                else [])
             + std.flattenArrays([[rivet('seam-%d-%d' % [k, j], 'rivet', bucketPath, [180, span + 4, -span - 4][k], 0.02 + 0.045 * j, 0.005, lift) for j in std.range(0, 4)] for k in [0, 1, 2]])
             + rivetRow('collar', 'rivet', bucketPath, 0.008, 10, 0.005, lift, 18)
             + skin('back-seam', 'steel', bucketPath, 176, 184, 0, 0.205, 0.004, 0.003, 6, lift),
             { steel: 'steel-bright', rivet: 'steel-grey', pad: 'cloth-cream', hole: 'plastic-matte-black', shade: 'cloth-charcoal' })
  + { voxelGrain: 0.004 };

// A full-face motorcycle helmet standing on its neck roll: a glossy shell with a window round the eyes, a smoked
// visor pivoting on a boss at each side, a black chin vent, a white stripe front to back and a padded black rim.
// `raised` swings the visor up over the brow and leaves the window open.
local motorHelmet(id, raised) =
  local win = [0.105, 0.172], span = 62;
  h.compound(id, 1.4,
             [
               shellPart('chin', 'shell', motorPath, 0.005, 0, win[0]),
               shellPart('crown', 'shell', motorPath, 0.005, win[1], 0.273),
               ring('neck', 'trim', 0, 0.014, 0.098, 0.125),
               ring('pad', 'pad', win[0] - 0.01, win[1] - win[0] + 0.02, 0.12, 0.13),
               rivet('pivot-l', 'trim', motorPath, 76, win[1] - 0.012, 0.014),
               rivet('pivot-r', 'trim', motorPath, -76, win[1] - 0.012, 0.014),
             ]
             + wallBand('cheek', 'shell', motorPath, 0.005, span, 360 - span, 12, win[0], win[1])
             + h.crescent('vent', 'trim', 0.13, 0.137, -18, 18, 3, 0.045, 0.07)
             + meridian('stripe', 'stripe', motorPath, 0, win[1] + 0.004, 0.272, 0.02, 0.002, 14)
             + meridian('stripe-b', 'stripe', motorPath, 180, 0.016, 0.272, 0.02, 0.002, 22)
             + (if raised then skin('visor', 'visor', motorPath, -74, 74, win[1] + 0.004, win[1] + 0.076, 0.004, 0.006, 6, 0, 10)
                else h.crescent('visor', 'visor', 0.138, 0.144, -74, 74, 12, win[0] - 0.006, win[1] + 0.006)),
             { shell: 'paint-red', stripe: 'plastic-white', trim: 'plastic-matte-black', pad: 'cloth-charcoal', visor: 'lens-smoke' })
  + { voxelGrain: 0.004 };

// Riding helmet and jockey skull cap: a round shell set low at the back.
local ridePath = [[0, 0.104], [0.04, 0.108], [0.09, 0.1], [0.125, 0.076], [0.15, 0.04], [0.158, 0]];
// Leather armour helmet: a rounded cap of stitched panels.
local larmorPath = [[0, 0.106], [0.05, 0.106], [0.09, 0.094], [0.12, 0.068], [0.14, 0.032], [0.145, 0]];
// Scrap helmet: a lumpy dome under its plates.
local scrapPath = [[0, 0.104], [0.05, 0.103], [0.1, 0.086], [0.135, 0.056], [0.152, 0.022], [0.155, 0]];

// A horse-riding helmet standing on its harness: a round shell under a black cloth cover with a button on top, a
// piped rim, black harness straps hanging at both sides and the back to a buckled chin strap lying underneath,
// and with `peak` a short stiff peak over the eyes.
local ridingHelmet(id, mass, peak, fin) =
  local lift = 0.03;
  h.compound(id, mass,
             [
               shell('shell', 'cover', ridePath, 0.006, lift),
               ring('piping', 'trim', lift - 0.002, 0.008, 0.102, 0.11),
               h.disc('button', 'cover', 0.012, lift + 0.156, lift + 0.164),
               box('strap-l', 'strap', [-0.108, 0, -0.03], [-0.102, lift, -0.014]),
               box('strap-r', 'strap', [0.102, 0, -0.03], [0.108, lift, -0.014]),
               box('strap-b', 'strap', [-0.008, 0, -0.108], [0.008, lift, -0.102]),
               box('chin', 'strap', [-0.108, 0, -0.03], [0.108, 0.004, -0.014]),
               box('chin-cup', 'trim', [-0.03, 0, -0.036], [0.03, 0.01, -0.008]),
               box('buckle', 'buckle', [0.05, 0, -0.034], [0.07, 0.008, -0.01]),
             ]
             + std.flattenArrays([skin('seam-%d' % k, 'trim', ridePath, 45 + 90 * k - 1.2, 45 + 90 * k + 1.2, 0.01, 0.15, 0.003, 0.002, 7, lift) for k in std.range(0, 3)])
             + (if peak then [h.prism('peak', 'peak', 'y', [[0.1, -0.075], [0.1, 0.075], [0.135, 0.06], [0.152, 0.03], [0.156, 0], [0.152, -0.03], [0.135, -0.06]], lift + 0.008, lift + 0.016)] else []),
             fin)
  + { voxelGrain: 0.004 };

[
  // A steel kettle helmet standing on its brim, 400 mm across and 190 mm tall: a round bowl with a raised comb from
  // front to back and a row of rivets round its foot, on a brim that slopes down to a rolled edge, a leather lining
  // band showing inside the rim.
  h.compound('helmet_kettle', 2.4,
             [
               shell('bowl', 'steel', kettleBowl, 0.003, 0.042),
               h.turned('brim', 'steel', 'y', [[0, 0.196], [0.044, 0.1], [0.048, 0.1], [0.006, 0.196], [0, 0.196]]),
               ring('roll', 'steel', 0, 0.01, 0.19, 0.204),
               ring('foot', 'steel', 0.04, 0.012, 0.1, 0.108),
               ring('lining', 'leather', 0.03, 0.04, 0.094, 0.1),
             ]
             + meridian('comb-f', 'steel', kettleBowl, 0, 0.004, 0.142, 0.01, 0.01, 8, 0.042)
             + meridian('comb-b', 'steel', kettleBowl, 180, 0.004, 0.142, 0.01, 0.01, 8, 0.042)
             + rivetRow('rivet', 'rivet', kettleBowl, 0.008, 12, 0.005, 0.042, 15),
             { steel: 'steel-grey', rivet: 'steel-bright', leather: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // An iron nasal helm, 210 mm across and 240 mm tall with its nose bar: a pointed cone on a darker brow band riveted
  // round, a flat bar down the front over the nose, and the leather lining edge inside the rim. It stands on the
  // tip of the bar and the back of the rim.
  local lift = 0.07;
  h.compound('helmet_nasal', 1.6,
             [
               shell('cone', 'iron', nasalPath, 0.003, lift),
               ring('brow', 'band', lift, 0.026, 0.101, 0.108),
               ring('lining', 'leather', lift - 0.008, 0.03, 0.094, 0.1),
               box('nasal', 'band', [-0.013, 0, 0.104], [0.013, lift + 0.026, 0.111]),
               box('nasal-tip', 'band', [-0.017, 0, 0.104], [0.017, 0.012, 0.111]),
             ]
             + meridian('rib-f', 'band', nasalPath, 0, 0.026, 0.168, 0.014, 0.003, 18, lift)
             + meridian('rib-b', 'band', nasalPath, 180, 0.026, 0.168, 0.014, 0.003, 18, lift)
             + meridian('rib-l', 'band', nasalPath, 90, 0.026, 0.168, 0.014, 0.003, 18, lift)
             + meridian('rib-r', 'band', nasalPath, 270, 0.026, 0.168, 0.014, 0.003, 18, lift)
             + rivetRow('rivet', 'rivet', nasalPath, 0.013, 12, 0.004, lift, 15),
             { iron: 'steel-grey', band: 'steel-parkerized', rivet: 'steel-bright', leather: 'leather-tan' })
  + { voxelGrain: 0.004 },

  // A skid lid standing on its chin strap, 200 mm across and 130 mm tall: a low polished steel pudding-basin dome
  // with a black plastic bead round the rim, black straps riveted on and hanging from both sides and a buckled strap lying across
  // underneath.
  local lift = 0.032;
  h.compound('helmet_skid', 0.96,
             [
               shell('dome', 'steel', skidPath, 0.003, lift),
               ring('bead', 'trim', lift - 0.002, 0.01, 0.094, 0.103),
               box('strap-l', 'strap', [-0.1, 0, -0.012], [-0.094, lift, 0.012]),
               box('strap-r', 'strap', [0.094, 0, -0.012], [0.1, lift, 0.012]),
               box('strap-x', 'strap', [-0.1, 0, -0.012], [0.1, 0.004, 0.012]),
               box('buckle', 'buckle', [0.02, 0, -0.016], [0.046, 0.008, 0.016]),
             ]
             + [rivet('stud-l', 'buckle', skidPath, 90, 0.014, 0.006, lift), rivet('stud-r', 'buckle', skidPath, 270, 0.014, 0.006, lift)],
             { steel: 'steel-bright', trim: 'plastic-matte-black', strap: 'leather-black', buckle: 'metal-silver' })
  + { voxelGrain: 0.004 },

  // An olive cotton helmet liner sitting on its flaps, 200 mm across and 175 mm tall: a soft skullcap stitched in
  // panels, with ear flaps at both sides and a neck flap at the back hanging to the floor.
  local lift = 0.05;
  h.compound('helmet_liner', 0.21,
             [shell('cap', 'cloth', linerPath, 0.004, lift)]
             + wallBand('flap-l', 'cloth', linerPath, 0.005, 60, 120, 4, -lift, 0.002, lift)
             + wallBand('flap-r', 'cloth', linerPath, 0.005, 240, 300, 4, -lift, 0.002, lift)
             + wallBand('flap-b', 'cloth', linerPath, 0.005, 145, 215, 4, -lift + 0.012, 0.002, lift)
             + std.flattenArrays([meridian('seam-%d' % a, 'seam', linerPath, a, 0, 0.126, 0.005, 0.002, 7, lift) for a in [0, 90, 180, 270]])
             + h.crescent('hem', 'seam', 0.094, 0.1, 0, 360, 16, lift - 0.002, lift + 0.004),
             { cloth: 'cloth-olive-drab', seam: 'webbing-olive-dark' })
  + { voxelGrain: 0.004 },
  // An iron kabuto standing on its neck guard, 360 mm across the turnbacks and 360 mm tall to its crest: a low black
  // bowl with raised ribs and a gilt band round its foot, a neck guard of four flaring black plates laced in red
  // round the back and sides with their front ends turned back as wings, gilt horns rising from the brow, and a red
  // half mask with a nose, a white moustache and a mouth slit over a laced throat guard.
  local y0 = 0.13;
  h.compound('helmet_kabuto', 2.5,
             [
               shell('bowl', 'iron', kabutoBowl, 0.003, y0),
               ring('band', 'gilt', y0 - 0.002, 0.018, 0.112, 0.12),
               ring('finial', 'gilt', y0 + 0.118, 0.01, 0.006, 0.022),
               box('crest-plate', 'gilt', [-0.016, y0 + 0.018, 0.112], [0.016, y0 + 0.05, 0.12]),
               box('nose', 'mask', [-0.012, 0.074, 0.118], [0.012, 0.106, 0.142]),
               box('mouth', 'slot', [-0.022, 0.05, 0.12], [0.022, 0.058, 0.128]),
               box('moustache-l', 'hair', [-0.04, 0.062, 0.12], [-0.006, 0.07, 0.132]),
               box('moustache-r', 'hair', [0.006, 0.062, 0.12], [0.04, 0.07, 0.132]),
             ]
             + std.flattenArrays([skin('rib-%d' % k, 'rib', kabutoBowl, 360 * k / 16 - 2, 360 * k / 16 + 2, 0.016, 0.11, 0.004, 0.003, 6, y0) for k in std.range(0, 15)])
             + std.flattenArrays([
               local top = y0 - 0.002 - 0.03 * k, r = 0.122 + 0.016 * k;
               h.crescent('lame-%d' % k, 'lacquer', r - 0.005, r, 52, 308, 14, std.max(0, top - 0.036), top)
               + std.flattenArrays([h.crescent('lace-%d-%d' % [k, j], 'lace', r - 0.002, r + 0.002, 66 + 19 * j - 1.5, 66 + 19 * j + 1.5, 1, std.max(0, top - 0.034), top - 0.004) for j in std.range(0, 12)])
               for k in std.range(0, 3)
             ])
             + std.flattenArrays([
               [
                 wall('wing-%d' % s, 'lacquer', polar(0.12, s * 52), polar(0.18, s * 74), 0.006, y0 - 0.06, y0 - 0.002),
                 wall('wing-trim-%d' % s, 'gilt', polar(0.18, s * 74), polar(0.183, s * 75), 0.008, y0 - 0.06, y0 - 0.002),
               ]
               for s in [-1, 1]
             ])
             + std.flattenArrays([
               crest('horn-%d' % s, 'gilt', [[s * 0.012, y0 + 0.03], [s * 0.03, y0 + 0.08], [s * 0.06, y0 + 0.14], [s * 0.085, y0 + 0.19], [s * 0.1, y0 + 0.235]], 0.022, 0.01, 0.116, 0.121)
               for s in [-1, 1]
             ])
             + h.crescent('mask', 'mask', 0.112, 0.12, -66, 66, 12, 0.03, 0.106)
             + h.crescent('chin', 'mask', 0.112, 0.126, -30, 30, 4, 0.028, 0.048)
             + std.flattenArrays([
               h.crescent('throat-%d' % k, 'lacquer', 0.118 + 0.008 * k, 0.123 + 0.008 * k, -64, 64, 10, 0.017 * (1 - k), 0.036 - 0.017 * k)
               for k in [0, 1]
             ])
             + [h.crescent('throat-lace-%d' % j, 'lace', 0.128, 0.132, -50 + 20 * j - 1.5, -50 + 20 * j + 1.5, 1, 0.002, 0.03)[0] for j in std.range(0, 5)],
             { iron: 'steel-parkerized', rib: 'steel-grey', gilt: 'brass-polished', lacquer: 'leather-black', lace: 'cloth-crimson', mask: 'leather-red', hair: 'fur-pale', slot: 'plastic-matte-black' })
  + { voxelGrain: 0.004 },

  // A steel great helm standing on its rim, 230 mm across and 300 mm tall: a flat-topped drum closed round the head,
  // two eye slits either side of a centre bar under a brass brow band, a brass strip down the face, a block of
  // breathing holes on the right cheek, dark padding showing through the slits and a leather lining edge inside the
  // rim.
  h.compound('helmet_plate', 3,
             [
               shellPart('face', 'steel', greatPath, 0.003, 0, 0.184),
               shellPart('crown', 'steel', greatPath, 0.003, 0.206, 0.297),
               ring('brow', 'brass', 0.206, 0.018, 0.113, 0.119),
               ring('lining', 'leather', -0.006, 0.03, 0.106, 0.112),
               ring('padding', 'pad', 0.178, 0.04, 0.096, 0.108),
             ]
             + wallBand('slit-back', 'steel', greatPath, 0.003, 74, 286, 12, 0.184, 0.206)
             + wallBand('slit-bar', 'steel', greatPath, 0.003, -4, 4, 1, 0.184, 0.206)
             + skin('strip', 'brass', greatPath, -4, 4, 0.02, 0.19, 0.004, 0.003, 4)
             + [rivet('hole-%d-%d' % [i, j], 'hole', greatPath, 22 + 9 * i, 0.08 + 0.018 * j, 0.0035) for i in std.range(0, 3) for j in std.range(0, 3)]
             + rivetRow('rivet', 'rivet', greatPath, 0.215, 14, 0.0045, 0, 12),
             { steel: 'steel-grey', brass: 'brass-dull', rivet: 'steel-bright', hole: 'plastic-matte-black', leather: 'leather-tan', pad: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // A sheet metal helmet, 300 mm across its collar and 290 mm tall: a crude riveted bucket with the face cut out, a
  // cotton pad showing round the opening, on a flared bevor collar.
  sheetHelmet('helmet_metal_sheets', 2.4, false),

  // A sheet metal great helm, 300 mm across its collar and 290 mm tall: the riveted bucket closed over the face with a
  // narrow eye slit and rows of breathing holes, on a flared bevor collar.
  sheetHelmet('helmet_metal_sheets_full', 2.6, true),

  // A full-face motorcycle helmet with its smoked visor down, 290 mm across and 275 mm tall.
  motorHelmet('helmet_motor', false),

  // The same full-face motorcycle helmet with its visor swung up over the brow, the eye window open.
  motorHelmet('helmet_motor_raised', true),
  // A black velvet-covered riding helmet (charcoal, so the black piping, seams and glossy peak read against it), 220 mm across and 190 mm tall with a 50 mm peak, standing on its harness.
  ridingHelmet('helmet_riding', 0.49, true, { cover: 'cloth-charcoal', trim: 'leather-black', strap: 'nylon-black', buckle: 'metal-silver', peak: 'leather-patent' }),

  // A white jockey skull cap, 220 mm across and 190 mm tall, standing on its harness: the same round shell with no
  // peak, as it is worn under a cloth cap cover.
  ridingHelmet('helmet_riding_peakless', 0.46, false, { cover: 'plastic-white', trim: 'plastic-matte-black', strap: 'nylon-black', buckle: 'metal-silver', peak: 'plastic-white' }),

  // A hardened leather helmet sitting on its flaps, 230 mm across and 185 mm tall: a rounded cap of six stitched
  // panels on a thick rolled brow band, a short neck flap at the back and a cheek flap at each side with a lace.
  local lift = 0.04;
  h.compound('helmet_larmor', 0.51,
             [
               shell('cap', 'leather', larmorPath, 0.006, lift),
               ring('brow', 'band', lift - 0.004, 0.024, 0.104, 0.114),
               ring('crown-knot', 'band', lift + 0.142, 0.008, 0, 0.016),
               box('lace-l', 'lace', [-0.112, 0, -0.004], [-0.106, lift + 0.004, 0.004]),
               box('lace-r', 'lace', [0.106, 0, -0.004], [0.112, lift + 0.004, 0.004]),
               box('lace-tail-l', 'lace', [-0.112, 0, 0.004], [-0.106, 0.004, 0.04]),
               box('lace-tail-r', 'lace', [0.106, 0, 0.004], [0.112, 0.004, 0.04]),
             ]
             + std.flattenArrays([skin('seam-%d' % k, 'band', larmorPath, 60 * k - 1.5, 60 * k + 1.5, 0.02, 0.142, 0.003, 0.003, 7, lift) for k in std.range(0, 5)])
             + wallBand('cheek-l', 'leather', larmorPath, 0.006, 70, 112, 4, -lift, 0.002, lift)
             + wallBand('cheek-r', 'leather', larmorPath, 0.006, 248, 290, 4, -lift, 0.002, lift)
             + wallBand('neck', 'leather', larmorPath, 0.006, 140, 220, 6, -lift + 0.008, 0.002, lift),
             { leather: 'leather-brown', band: 'leather-chestnut', lace: 'skin-rawhide' })
  + { voxelGrain: 0.004 },

  // A scrap helmet standing on its rim, 220 mm across and 165 mm tall: a rusty dome patched over with mismatched
  // plates of galvanised, bright and rusted steel, a round plate on the crown, cord lashings strung over the plates
  // and a ragged cloth lining hanging below the rim.
  local lift = 0.012;
  local plates = [
    // [bearing from, bearing to, height from, height to, finish slot, proud]
    [-40, 25, 0.0, 0.07, 'galv', 0.004],
    [15, 80, 0.03, 0.1, 'bright', 0.006],
    [70, 140, 0.0, 0.065, 'rust', 0.004],
    [130, 200, 0.02, 0.095, 'galv', 0.006],
    [190, 260, 0.0, 0.06, 'bright', 0.004],
    [250, 320, 0.025, 0.1, 'rust', 0.006],
    [-80, -30, 0.05, 0.115, 'rust', 0.008],
    [100, 170, 0.075, 0.125, 'bright', 0.008],
  ];
  h.compound('helmet_scrap', 2,
             [
               shell('dome', 'base', scrapPath, 0.003, lift),
               ring('lining', 'cloth', 0, lift + 0.01, 0.096, 0.102),
               h.disc('crown', 'galv', 0.05, lift + 0.135, lift + 0.143),
               h.disc('crown-bolt', 'bolt', 0.01, lift + 0.143, lift + 0.149),
             ]
             + std.flattenArrays([
               local p = plates[i];
               skin('plate-%d' % i, p[4], scrapPath, p[0], p[1], p[2], p[3], 0.004, p[5], 3, lift, 4)
               for i in std.range(0, std.length(plates) - 1)
             ])
             + std.flattenArrays([skin('cord-%d' % k, 'cord', scrapPath, 45 * k + 20 - 1.5, 45 * k + 20 + 1.5, 0.0, 0.134, 0.003, 0.01, 7, lift) for k in std.range(0, 7)])
             + h.crescent('cord-ring', 'cord', scrapPath[0][1] + 0.006, scrapPath[0][1] + 0.011, 0, 360, 20, lift + 0.03, lift + 0.035),
             { base: 'scrap-rusted', galv: 'steel-galvanised', bright: 'steel-bright', rust: 'rust-red', bolt: 'steel-grey', cord: 'cord-cotton', cloth: 'cloth-rag' })
  + { voxelGrain: 0.004 },

  // The top of a large wolf skull made into a helmet, lying on its teeth, 340 mm from the back of the braincase to the
  // nose and 205 mm across the cheekbones: a domed braincase with a ridge down the middle, cheekbones flaring round
  // dark eye sockets, a long muzzle ending in the nose opening, the upper teeth and fangs along its edges, and a
  // leather strap from each cheekbone lying out to a buckle.
  local lift = 0.016, k = 1.25;
  // Drawn at 0.8 scale and scaled up by k, so its proportions stay easy to adjust.
  local sb(id, slot, a, b) = box(id, slot, [k * v for v in a], [k * v for v in b]);
  // Cross sections along z: [z, half width, height], eased between in thin slices so the bone reads rounded.
  local secs = [[-0.12, 0.03, 0.04], [-0.105, 0.06, 0.07], [-0.08, 0.072, 0.085], [-0.04, 0.074, 0.09], [0.0, 0.066, 0.082], [0.03, 0.05, 0.068], [0.06, 0.04, 0.056], [0.1, 0.034, 0.046], [0.13, 0.03, 0.04], [0.15, 0.024, 0.032]];
  local at(z, c) =
    local seg = [i for i in std.range(0, std.length(secs) - 2) if secs[i][0] <= z && z <= secs[i + 1][0]];
    local i = if std.length(seg) == 0 then std.length(secs) - 2 else seg[0], a = secs[i], b = secs[i + 1];
    a[c] + (b[c] - a[c]) * (z - a[0]) / (b[0] - a[0]);
  local nz = 27, z0 = -0.12, dz = 0.01;
  local slice(i) =
    local zc = z0 + dz * (i + 0.5), w = at(zc, 1), ht = at(zc, 2), n = 12;
    h.prism('bone-%d' % i, 'bone', 'z', [[k * w * std.cos(std.pi * j / n), k * (lift + ht * std.sin(std.pi * j / n))] for j in std.range(0, n)], k * (z0 + dz * i), k * (z0 + dz * (i + 1)));
  h.compound('helmet_skull', 1.1,
             [slice(i) for i in std.range(0, nz - 1)]
             // The crest down the braincase, riding its top.
             + [
               local zc = -0.105 + 0.01 * i + 0.005;
               sb('ridge-%d' % i, 'bone', [-0.005, lift + at(zc, 2) - 0.006, -0.105 + 0.01 * i], [0.005, lift + at(zc, 2) + 0.008 - 0.001 * i, -0.095 + 0.01 * i])
               for i in std.range(0, 8)
             ]
             + [
               sb('cheek-l', 'bone', [-0.088, lift, -0.03], [-0.05, lift + 0.026, 0.03]),
               sb('cheek-r', 'bone', [0.05, lift, -0.03], [0.088, lift + 0.026, 0.03]),
               sb('brow-l', 'bone', [-0.062, lift + 0.054, -0.008], [-0.022, lift + 0.068, 0.006]),
               sb('brow-r', 'bone', [0.022, lift + 0.054, -0.008], [0.062, lift + 0.068, 0.006]),
               sb('socket-l', 'dark', [-0.058, lift + 0.026, 0.0], [-0.026, lift + 0.062, 0.036]),
               sb('socket-r', 'dark', [0.026, lift + 0.026, 0.0], [0.058, lift + 0.062, 0.036]),
               sb('nose', 'dark', [-0.016, lift + 0.006, 0.148], [0.016, lift + 0.026, 0.152]),
               sb('fang-l', 'tooth', [-0.03, 0, 0.1], [-0.018, lift + 0.004, 0.112]),
               sb('fang-r', 'tooth', [0.018, 0, 0.1], [0.03, lift + 0.004, 0.112]),
             ]
             + [
               local zc = 0.085 - 0.022 * j, x = at(zc, 1) - 0.007;
               sb('tooth-%d-%d' % [s, j], 'tooth', [s * x - 0.005, 0, zc - 0.007], [s * x + 0.005, lift + 0.002, zc + 0.007])
               for s in [-1, 1]
               for j in std.range(0, 4)
             ]
             + [
               sb('strap-l', 'strap', [-0.15, 0, -0.026], [-0.084, 0.004, -0.01]),
               sb('strap-r', 'strap', [0.084, 0, -0.026], [0.15, 0.004, -0.01]),
               sb('strap-drop-l', 'strap', [-0.09, 0, -0.026], [-0.084, lift + 0.01, -0.01]),
               sb('strap-drop-r', 'strap', [0.084, 0, -0.026], [0.09, lift + 0.01, -0.01]),
               sb('buckle', 'buckle', [0.13, 0, -0.03], [0.146, 0.008, -0.006]),
             ],
             { bone: 'bone', dark: 'plastic-matte-black', tooth: 'chalk-white', strap: 'leather-brown', buckle: 'brass-dull' })
  + { voxelGrain: 0.004 },
]
