local h = import '../compound.libsonnet';
local box = h.box;
local rad(d) = d * std.pi / 180;

// A closed ring turned about y from `y0` to `y0 + ht`, radii `r0` to `r1`, for hat bands and rolled brim edges.
local ring(id, slot, y0, ht, r0, r1, x=0, z=0) = h.turned(id, slot, 'y', [[0, r0], [0, r1], [ht, r1], [ht, r0], [0, r0]], [x, y0, z]);
// A hollow shell turned about y from an outside path of [y, r] points running from the brim edge up to the crown
// (ending on the axis), returned down the inside `t` lower and in, so the hat stays open underneath.
local shell(id, slot, outside, t) =
  local n = std.length(outside);
  local inside = [[outside[n - 1 - i][0] - t, std.max(0, outside[n - 1 - i][1] - (if outside[n - 1 - i][1] == 0 then 0 else t))] for i in std.range(0, n - 1)];
  h.turned(id, slot, 'y', outside + inside + [outside[0]]);
// A five-pointed star `r` across its points, as convex pieces: a pentagon and five points. `pt(u, v)` maps the
// star's own plane onto the prism's profile plane.
local star(id, slot, axis, r, start, end, pt) =
  local inner = r * 0.42;
  local at(rr, k) = pt(rr * std.sin(rad(72 * k / 2)), rr * std.cos(rad(72 * k / 2)));
  [h.prism(id + '-c', slot, axis, [at(inner, 2 * k + 1) for k in std.range(0, 4)], start, end)]
  + [h.prism('%s-%d' % [id, k], slot, axis, [at(inner, 2 * k - 1), at(r, 2 * k), at(inner, 2 * k + 1)], start, end) for k in std.range(0, 4)];

// A strip from [z, x] point `a` to `b`, `t` thick toward the centre, standing on y from y0 to y1: hat walls.
local wall(id, slot, a, b, t, y0, y1) =
  local dz = b[0] - a[0], dx = b[1] - a[1], len = std.sqrt(dz * dz + dx * dx);
  local nz = dx / len * t, nx = -dz / len * t;
  h.prism(id, slot, 'y', [a, b, [b[0] + nz, b[1] + nx], [a[0] + nz, a[1] + nx]], y0, y1);

// A tricorne's brim corner at bearing `b` degrees from the front, as [z, x].
local corner(R, b) = [R * std.cos(rad(b)), R * std.sin(rad(b))];

// Turban wraps: a band of cloth wound round a centre in segments whose height climbs `rise` per turn from `y0`, `w`
// tall and standing `t` proud of radius `r`, over `turn` degrees from bearing `a0`.
local wrap(prefix, slot, r, t, w, a0, turn, y0, rise, steps) = std.flattenArrays([
  local y = y0 + rise * (i + 0.5) / steps;
  h.crescent('%s-%d' % [prefix, i], slot, r - 0.004, r + t, a0 + turn * i / steps, a0 + turn * (i + 1) / steps, 1, y, y + w)
  for i in std.range(0, steps - 1)
]);

// The radius of an outside path of [y, r] points at height y, by straight runs between its points.
local radiusAt(path, y) =
  local n = std.length(path);
  local seg = [i for i in std.range(0, n - 2) if path[i][0] <= y && y <= path[i + 1][0]];
  if std.length(seg) == 0 then (if y < path[0][0] then path[0][1] else path[n - 1][1])
  else
    local i = seg[0], a = path[i], b = path[i + 1];
    a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
local turbanPath = [[0, 0.104], [0.03, 0.11], [0.07, 0.111], [0.1, 0.1], [0.118, 0.08], [0.128, 0.05], [0.131, 0]];
// One turban wrap from the front round one side to the back, climbing as it goes, laid on the body at its height.
local turbanWrap(prefix, side, y0, rise, w, steps=12) = [
  local y = y0 + rise * (i + 0.5) / steps, r = radiusAt(turbanPath, y + w / 2);
  h.crescent('%s-%d' % [prefix, i], 'wrap', r - 0.006, r + 0.006, side * 180 * i / steps, side * 180 * (i + 1) / steps, 1, y, y + w)[0]
  for i in std.range(0, steps - 1)
];
local wizardPath = [[0.006, 0.105], [0.12, 0.07], [0.24, 0.035], [0.33, 0.008], [0.34, 0]];

[
  // A wide-brimmed woven straw sun hat sitting on its brim, 400 mm across and 120 mm tall: a rounded crown on a
  // brim that droops at the edge, a brown cloth band round the crown and raised rings of plait on the brim.
  h.compound('straw_hat', 0.12,
             [
               shell('hat', 'straw', [[0.006, 0.2], [0.016, 0.17], [0.026, 0.12], [0.03, 0.1], [0.09, 0.094], [0.112, 0.08], [0.122, 0.05], [0.125, 0]], 0.006),
               ring('band', 'band', 0.028, 0.024, 0.092, 0.099),
             ]
             + [ring('plait-%d' % i, 'plait', [0.026, 0.02, 0.012][i] - 0.002, 0.005, [0.125, 0.15, 0.178][i], [0.125, 0.15, 0.178][i] + 0.006) for i in [0, 1, 2]]
             + [box('bow', 'band', [0.07, 0.03, 0.06], [0.09, 0.05, 0.08])],
             { straw: 'straw-wicker', plait: 'straw-wicker', band: 'cloth-brown' })
  + { voxelGrain: 0.004 },

  // A tall black silk top hat sitting on its brim, 300 mm across the brim and 165 mm tall: a straight crown that
  // waists a little and flares to a flat top, a flat brim with a rolled edge, and a matt band above the brim.
  h.compound('tophat', 0.2,
             [
               shell('crown', 'silk', [[0.012, 0.088], [0.06, 0.084], [0.12, 0.086], [0.16, 0.09], [0.165, 0.088], [0.165, 0]], 0.004),
               ring('brim', 'silk', 0.006, 0.006, 0.084, 0.145),
               ring('brim-roll', 'silk', 0.006, 0.012, 0.137, 0.15),
               ring('band', 'band', 0.012, 0.032, 0.085, 0.091),
             ],
             { silk: 'satin-black', band: 'cloth-charcoal' })
  + { voxelGrain: 0.004 },

  // An oiled black leather three-cornered hat sitting on its brim, 360 mm across and 136 mm tall: a
  // round crown inside a brim turned up into three walls, one corner to the front, gold braid along the wall tops and
  // a gold-buttoned cockade on the left wall.
  local R = 0.2, top = 0.1, low = 0.062, cs = [corner(R, b) for b in [0, 120, 240]];
  // The left wall runs from the front corner to the corner at 120 degrees; the cockade sits on its middle.
  local m = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2], len = std.sqrt(m[0] * m[0] + m[1] * m[1]);
  local ck = [m[1] / len * (len + 0.004), m[0] / len * (len + 0.004)];
  h.compound('tricorne', 0.62,
             [
               h.dome('crown', 'leather', 0.085, 0.065, 0.006, 'y', [0, 0.07, 0]),
               ring('crown-wall', 'leather', 0, 0.072, 0.079, 0.085),
               h.prism('brim', 'leather', 'y', cs, 0, 0.006),
             ]
             // Each wall is cut into segments that rise from its middle toward the corners, where the brim is pinned up.
             + std.flattenArrays([
               local a = cs[i], b = cs[(i + 1) % 3], n = 14;
               local p(f) = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
               local ht(f) = low + (top - low) * std.pow(std.abs(2 * f - 1), 1.6);
               [wall('wall-%d-%d' % [i, k], 'leather', p(k / n), p((k + 1) / n), 0.006, 0, ht((k + 0.5) / n)) for k in std.range(0, n - 1)]
               + [wall('braid-%d-%d' % [i, k], 'braid', p(k / n), p((k + 1) / n), 0.007, ht((k + 0.5) / n), ht((k + 0.5) / n) + 0.006) for k in std.range(0, n - 1)]
               for i in [0, 1, 2]
             ])
             + [
               h.turned('cockade', 'cockade', 'y', [[0, 0], [0, 0.02], [0.012, 0.022], [0.026, 0.016], [0.034, 0]], [ck[0], low * 0.4, ck[1]]),
               h.disc('button', 'braid', 0.008, low * 0.4 + 0.03, low * 0.4 + 0.038, ck[0], ck[1]),
             ],
             { leather: 'leather-black', braid: 'metal-gold', cockade: 'cloth-black' })
  + { voxelGrain: 0.004 },

  // A plain cotton turban as it is set down already wound, 230 mm across and 144 mm tall: a rounded wound crown
  // with folds of cloth crossing in a V over the forehead (+z) and climbing round the sides to the back.
  h.compound('turban', 0.2,
             [shell('body', 'cloth', turbanPath, 0.012)]
             + std.flattenArrays([
               turbanWrap('wrap-%s-%d' % [if side > 0 then 'l' else 'r', k], side, 0.002 + 0.036 * k, 0.07, 0.026, 16)
               for side in [1, -1]
               for k in [0, 1]
             ]),
             { cloth: 'cloth-cream', wrap: 'cloth-white' })
  + { voxelGrain: 0.004 },

  // A blue costume wizard hat standing on its brim, 380 mm across and 336 mm tall: a tall cone on a wide floppy
  // brim, a gold band round its foot and gold stars stitched over the cone and brim.
  local coneStar(id, x, y, r) = local z = std.sqrt(std.pow(radiusAt(wizardPath, y), 2) - x * x);
    star(id, 'star', 'z', r, z - 0.005, z + 0.002, function(u, v) [x + u, y + v]);
  local sideStar(id, side, z, y, r) = local x = std.sqrt(std.pow(radiusAt(wizardPath, y), 2) - z * z);
    star(id, 'star', 'x', r, side * x - 0.005, side * x + 0.002, function(u, v) [y + v, z + u]);
  local brimStar(id, x, z, r) = star(id, 'star', 'y', r, 0.004, 0.009, function(u, v) [z + v, x + u]);
  h.compound('wizard_hat_costume', 0.1,
             [
               shell('cone', 'cloth', wizardPath, 0.006),
               ring('brim', 'cloth', 0, 0.006, 0.098, 0.19),
               ring('band', 'band', 0.006, 0.022, 0.1, 0.108),
             ]
             + coneStar('star-a', 0, 0.075, 0.022) + coneStar('star-b', -0.025, 0.17, 0.016) + coneStar('star-c', 0.012, 0.25, 0.012)
             + sideStar('star-d', 1, 0.01, 0.11, 0.018) + sideStar('star-e', -1, -0.01, 0.15, 0.016) + sideStar('star-f', 1, -0.02, 0.21, 0.012)
             + brimStar('star-g', 0.0, 0.15, 0.02) + brimStar('star-h', 0.12, 0.09, 0.016) + brimStar('star-i', -0.12, 0.1, 0.016)
             + brimStar('star-j', -0.1, -0.12, 0.016),
             { cloth: 'cloth-blue', band: 'metal-gold', star: 'metal-gold' })
  + { voxelGrain: 0.004 },

  // A crimson silk skullcap lying crown up, 174 mm across and 56 mm tall: a shallow cap with a short stem at the crown and a bound rim.
  h.compound('zucchetto', 0.021,
             [
               h.dome('cap', 'silk', 0.085, 0.04, 0.005, 'y', [0, 0, 0]),
               ring('rim', 'silk', 0, 0.006, 0.08, 0.087),
               h.disc('stem', 'silk', 0.005, 0.036, 0.052),
               h.disc('stem-knot', 'silk', 0.008, 0.05, 0.056),
             ],
             { silk: 'cloth-crimson' })
  + { voxelGrain: 0.002 },

  // Panoramic night-vision goggles as they come off a helmet, 178 mm across, 132 mm deep and 92 mm tall: four
  // image tubes on one housing, the inner pair with rubber eyecups at the back (-z) and the outer pair set back
  // and wider for the side view, green-coated objective lenses at the front (+z), and the helmet mount shoe on top.
  local tube(id, x, y, r, z0, z1) = h.turned(id, 'body', 'z', [[0, 0], [0, r], [z1 - z0, r], [z1 - z0, 0]], [x, y, z0]);
  local lens(id, x, y, r, z) = h.turned(id, 'lens', 'z', [[0, 0], [0, r], [0.003, r], [0.003, 0]], [x, y, z]);
  h.compound('panoramic_nvg', 0.63,
             std.flattenArrays([
               [
                 tube('inner-%d' % i, s * 0.03, 0.021, 0.019, -0.04, 0.07),
                 h.turned('ring-%d' % i, 'trim', 'z', [[0, 0.016], [0, 0.021], [0.008, 0.021], [0.008, 0.016], [0, 0.016]], [s * 0.03, 0.021, 0.055]),
                 lens('lens-in-%d' % i, s * 0.03, 0.021, 0.015, 0.07),
                 h.turned('eyecup-%d' % i, 'rubber', 'z', [[0, 0.012], [0, 0.021], [0.02, 0.02], [0.02, 0.014], [0, 0.012]], [s * 0.03, 0.021, -0.06]),
                 tube('outer-%d' % i, s * 0.07, 0.019, 0.017, -0.012, 0.06),
                 h.turned('ring-out-%d' % i, 'trim', 'z', [[0, 0.014], [0, 0.019], [0.007, 0.019], [0.007, 0.014], [0, 0.014]], [s * 0.07, 0.019, 0.047]),
                 lens('lens-out-%d' % i, s * 0.07, 0.019, 0.013, 0.06),
                 box('cheek-%d' % i, 'body', [if s > 0 then 0.045 else -0.085, 0.012, -0.01], [if s > 0 then 0.085 else -0.045, 0.034, 0.03]),
                 box('focus-%d' % i, 'trim', [if s > 0 then 0.03 else -0.05, 0.036, 0.0], [if s > 0 then 0.05 else -0.03, 0.044, 0.012]),
               ]
               for i in [0, 1]
               for s in [if i == 0 then -1 else 1]
             ])
             + [
               box('bridge', 'body', [-0.05, 0.03, -0.03], [0.05, 0.062, 0.035]),
               box('switch', 'trim', [-0.012, 0.062, 0.012], [0.012, 0.07, 0.028]),
               box('shoe', 'mount', [-0.022, 0.062, -0.024], [0.022, 0.078, 0.008]),
               box('dovetail', 'mount', [-0.014, 0.078, -0.03], [0.014, 0.092, 0.0]),
               box('plug', 'trim', [0.024, 0.062, -0.03], [0.04, 0.074, -0.012]),
             ],
             { body: 'plastic-matte-black', trim: 'plastic-charcoal', rubber: 'rubber-black', lens: 'glass-lens-green', mount: 'alu-anodized-black' })
  + { voxelGrain: 0.002 },

  // A pair of helmet ear muffs as they come off a hard hat, 200 mm across and 140 mm tall: two yellow cups standing
  // face to face on their black foam cushions' edges, each on a sprung steel wire arm that ends in a flat black clip
  // blade made to slide into a helmet's side slot.
  local cupX = 0.07, cupY = 0.044;
  h.compound('attachable_ear_muffs', 0.16,
             std.flattenArrays([
               [
                 h.turned('cup-%d' % i, 'cup', 'x', if s < 0 then [[0, 0], [0, 0.036], [0.008, 0.042], [0.03, 0.042], [0.03, 0]] else [[0, 0], [0, 0.042], [0.022, 0.042], [0.03, 0.036], [0.03, 0]], [s * cupX - (if s < 0 then 0.03 else 0), cupY, 0]),
                 h.turned('cushion-%d' % i, 'cushion', 'x', [[0, 0.022], [0, 0.04], [0.016, 0.038], [0.016, 0.024], [0, 0.022]], [if s < 0 then -cupX else cupX - 0.016, cupY, 0]),
                 box('pivot-%d' % i, 'clip', [s * cupX - 0.012, cupY + 0.036, -0.008], [s * cupX + 0.012, cupY + 0.05, 0.008]),
                 box('wire-a-%d' % i, 'wire', [s * cupX - 0.002, cupY + 0.05, -0.012], [s * cupX + 0.002, 0.13, -0.008]),
                 box('wire-b-%d' % i, 'wire', [s * cupX - 0.002, cupY + 0.05, 0.008], [s * cupX + 0.002, 0.13, 0.012]),
                 box('blade-%d' % i, 'clip', [s * (cupX - 0.003) - 0.003, 0.125, -0.024], [s * (cupX - 0.003) + 0.003, 0.142, 0.024]),
                 box('tongue-%d' % i, 'clip', [if s < 0 then -cupX + 0.003 else cupX - 0.033, 0.134, -0.016], [if s < 0 then -cupX + 0.033 else cupX - 0.003, 0.139, 0.016]),
               ]
               for i in [0, 1]
               for s in [if i == 0 then -1 else 1]
             ]),
             { cup: 'plastic-yellow', cushion: 'vinyl-black', wire: 'steel-grey', clip: 'plastic-matte-black' })
  + { voxelGrain: 0.002 },
]
