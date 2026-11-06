// Shared footwear builder: boots, shoes and sabatons standing as a pair. Usage: `local f = import 'footwear.libsonnet';`
// then `h.compound(id, mass, f.pair(f.preset.hiking, 0.02, function(p, cx) f.laces(p, f.preset.hiking, cx, 0.05, 0.16)), finish)`.
local h = import 'compound.libsonnet';
local box = h.box;
// Footwear stands as a pair, toes to +z, side by side along x. Plan outlines are lists of [z, x] points, the order a
// prism standing on y takes them in.
//
// The plan outline of a foot `l` long and `w` across, heel at -z and toe at +z. `point` narrows the toe for a
// pointed boot.
local foot(l, w, point=0) = [
  [-l / 2, -w * 0.28], [-l / 2, w * 0.28],
  [-l * 0.42, w * 0.44], [-l * 0.2, w * 0.48], [l * 0.12, w / 2], [l * 0.3, w * 0.46],
  [l * 0.42, w * (0.34 - point * 0.12)], [l / 2, w * (0.14 - point * 0.1)],
  [l / 2, -w * (0.14 - point * 0.1)], [l * 0.42, -w * (0.34 - point * 0.12)],
  [l * 0.3, -w * 0.46], [l * 0.12, -w / 2], [-l * 0.2, -w * 0.48], [-l * 0.42, -w * 0.44],
];
// An outline scaled across x by `sx` and along z by `sz` about its middle, then moved to (cx, cz).
local place(poly, cx, cz, sx=1, sz=1) = [[p[0] * sz + cz, p[1] * sx + cx] for p in poly];
// An ellipse `rx` across x and `rz` along z, in 14 points.
local ellipse(rx, rz) = [[rz * std.cos(2 * std.pi * i / 14), rx * std.sin(2 * std.pi * i / 14)] for i in std.range(0, 13)];
// One boot on a foot `b.l` long and `b.w` across, centred at x = cx. Its sole is `b.t` thick, a heel adds `b.heel`
// under the back, the toe climbs in `b.layers` steps to the instep at `b.ankle`, and the shaft, an ellipse `b.rx` by
// `b.rz` at the back of the foot, rises to `b.top` with a collar `b.collar` deep. A shaft of `b.top` 0 leaves a low
// shell with no shaft, and `b.from` cuts away the foot behind that z, for a shell over the front of the foot.
// `b.laneSlots` gives the toe steps two alternating slots, for lames. Slots: sole, upper, shaft, collar, lining, and
// the toe slot named by `b.toeSlot`.
local boot(p, b, cx) =
  local l = b.l, w = b.w, t = b.t, n = b.layers;
  local sc = -l / 2 + b.rz + 0.008;
  local zs = sc + b.rz * 0.6;
  local whole = foot(l, w, std.get(b, 'point', 0));
  local outline = if std.objectHas(b, 'from') then h.clipX(whole, b.from, true) else whole;
  local zfront(u) = zs + (l / 2 - zs) * std.sqrt(std.max(0, 1 - u * u));
  local layer(i) =
    local u = i / n;
    local y0 = t + (b.ankle - t) * u;
    local y1 = t + (b.ankle - t) * (i + 1) / n;
    local shrink = 1 - 0.12 * u;
    local clipped = h.clipX(outline, zfront(u), false);
    { y0: y0, y1: y1, poly: place(clipped, cx, 0, shrink) };
  local heel = std.get(b, 'heel', 0);
  [
    h.prism(p + 'sole', 'sole', 'y', place(outline, cx, 0, 1.06, 1.03), 0, t),
  ] + (if heel > 0 then [
         h.prism(p + 'heel', 'sole', 'y', place(h.clipX(outline, -l * 0.24, false), cx, -0.004, 0.86, 1), t, t + heel),
       ] else []) + [
    local s = layer(i);
    h.prism(p + 'vamp-%d' % i, if std.objectHas(b, 'laneSlots') then b.laneSlots[i % 2] else 'upper', 'y', s.poly, s.y0, s.y1 + 0.001)
    for i in std.range(0, n - 1)
  ] + (if std.objectHas(b, 'toeSlot') then [
         local s = layer(i);
         h.prism(p + 'toe-%d' % i, b.toeSlot, 'y', place(h.clipX(h.clipX(outline, zfront(i / n), false), l * 0.2, true), cx, 0.003, 1.05 * (1 - 0.12 * i / n)), s.y0, s.y1 + 0.001)
         for i in std.range(0, std.max(0, std.floor(n * 0.6) - 1))
       ] else []) + (if b.top > 0 then [
         h.prism(p + 'shaft', 'shaft', 'y', place(ellipse(b.rx, b.rz), cx, sc), t, b.top - b.collar),
         h.prism(p + 'collar', 'collar', 'y', place(ellipse(b.rx + std.get(b, 'collarOut', 0.003), b.rz + std.get(b, 'collarOut', 0.003)), cx, sc), b.top - b.collar, b.top),
         h.prism(p + 'opening', 'lining', 'y', place(ellipse(b.rx * 0.72, b.rz * 0.72), cx, sc), b.top, b.top + 0.002),
       ] else []);
// The shaft's middle along z and its front face, for laces, straps and trim.
local shaftZ(b) = -b.l / 2 + b.rz + 0.008;
// Laces up the shaft's front from y0 to y1: a tongue strip with crossed lace bars every `pitch`. Slots: tongue, lace.
local laces(p, b, cx, y0, y1, pitch=0.016) =
  local zf = shaftZ(b) + b.rz;
  [box(p + 'tongue', 'tongue', [cx - 0.016, y0, zf - 0.01], [cx + 0.016, y1, zf + 0.002])] + [
    box(p + 'lace-%d' % i, 'lace', [cx - 0.02, y0 + 0.006 + i * pitch, zf], [cx + 0.02, y0 + 0.009 + i * pitch, zf + 0.004])
    for i in std.range(0, std.floor((y1 - y0 - 0.01) / pitch))
  ];
// A band round the shaft from y0 to y1, standing `out` proud: straps, rims and trim. Slot as given.
local band(p, slot, b, cx, y0, y1, out=0.003) = h.prism(p, slot, 'y', place(ellipse(b.rx + out, b.rz + out), cx, shaftZ(b)), y0, y1);
// Two boots `gap` apart, each with `extra(prefix, cx)` added.
local pair(b, gap, extra=function(p, cx) []) = std.flattenArrays([
  local cx = s * (b.w / 2 + gap / 2) * 1.06;
  local p = if s < 0 then 'l-' else 'r-';
  boot(p, b, cx) + extra(p, cx)
  for s in [-1, 1]
]);
{
  foot: foot,
  place: place,
  ellipse: ellipse,
  boot: boot,
  shaftZ: shaftZ,
  laces: laces,
  band: band,
  pair: pair,
  // Starting proportions; copy one and change what differs.
  preset: {
    hiking: { l: 0.29, w: 0.105, t: 0.022, layers: 6, ankle: 0.085, top: 0.17, rx: 0.046, rz: 0.058, collar: 0.022, collarOut: 0.006, toeSlot: 'rand' },
    western: { l: 0.3, w: 0.095, t: 0.012, heel: 0.03, point: 1, layers: 6, ankle: 0.08, top: 0.32, rx: 0.044, rz: 0.06, collar: 0.006, collarOut: 0.001 },
    larmor: { l: 0.29, w: 0.108, t: 0.016, heel: 0.01, layers: 6, ankle: 0.09, top: 0.25, rx: 0.05, rz: 0.06, collar: 0.016, toeSlot: 'plate' },
    plated: { l: 0.3, w: 0.112, t: 0.016, heel: 0.012, layers: 7, ankle: 0.1, top: 0.27, rx: 0.052, rz: 0.062, collar: 0.014, collarOut: 0.005, laneSlots: ['plate', 'edge'] },
    scrap: { l: 0.29, w: 0.11, t: 0.014, layers: 5, ankle: 0.085, top: 0.2, rx: 0.05, rz: 0.06, collar: 0.02, collarOut: 0.004, toeSlot: 'scrap' },
    work: { l: 0.29, w: 0.108, t: 0.024, heel: 0.006, layers: 6, ankle: 0.085, top: 0.18, rx: 0.048, rz: 0.058, collar: 0.02, collarOut: 0.005, toeSlot: 'toecap' },
    sheet: { l: 0.3, w: 0.116, t: 0.004, layers: 3, ankle: 0.095, top: 0, rx: 0.05, rz: 0.06, collar: 0, from: -0.02, laneSlots: ['plate', 'edge'] },
  },
}
