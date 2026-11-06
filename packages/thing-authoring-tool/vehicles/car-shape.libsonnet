// What a car's wheel arches and greenhouse share across its rows. `s.tumble` is how far the side glass, pillars and roof
// lean in from waist to roof; `s.archChamfer` is the cut off each top corner of a wheel arch. Prisms extrude straight
// along z, so a leaning piece is pressed as one band per voxel of lean; both measures stay whole voxels for that reason.
local k = import 'kit.libsonnet';
local grain = 0.03125;
local near(a, b) = std.abs(a - b) < 1e-6;
local clipY(poly, y, above) =
  local n = std.length(poly);
  local inside(p) = if above then p[1] >= y else p[1] <= y;
  std.flattenArrays([
    local a = poly[i];
    local b = poly[(i + 1) % n];
    (if inside(a) then [a] else [])
    + (if inside(a) != inside(b) then [[a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y]] else [])
    for i in std.range(0, n - 1)
  ]);
// Export refuses a repeated or collinear point, and a clip through a vertex makes both.
local tidy(poly) =
  local n = std.length(poly);
  local apart = [
    poly[i]
    for i in std.range(0, n - 1)
    if !(near(poly[i][0], poly[(i + 1) % n][0]) && near(poly[i][1], poly[(i + 1) % n][1]))
  ];
  local m = std.length(apart);
  local bends(i) =
    local p = apart[(i + m - 1) % m];
    local q = apart[(i + 1) % m];
    std.abs((apart[i][0] - p[0]) * (q[1] - apart[i][1]) - (apart[i][1] - p[1]) * (q[0] - apart[i][0])) > 1e-7;
  [apart[i] for i in std.range(0, m - 1) if bends(i)];
function(s) {
  local outer = self,
  grain: grain,
  tumble: std.get(s, 'tumble', 0.125),
  local steps = std.max(1, std.round(outer.tumble / grain)),
  local rise = s.roof - s.waist,
  local lineY(i) = s.waist + rise * i / steps,
  local insetOf(i) = outer.tumble * (i + 1) / steps,
  inset(y): insetOf(std.max(0, std.min(steps - 1, std.floor((y - s.waist) / rise * steps)))),
  // The topmost band's id, for an anchor at the head of a leaning piece.
  top(id): id + '_' + (steps - 1),
  // The part of `profile` in each band; `range` gives its z span from that band's lean. The lowest band keeps whatever
  // lies below the waist and the highest whatever lies above the roof.
  band(id, slot, profile, range):
    local slice(i) =
      local low = if i == 0 then profile else clipY(profile, lineY(i), true);
      tidy(if i == steps - 1 then low else clipY(low, lineY(i + 1), false));
    [
      k.prism(id + '_' + i, slot, slice(i), range(insetOf(i)))
      for i in std.range(0, steps - 1)
      if std.length(slice(i)) >= 3
    ],
  // `band` with the near side's z span at the waist, moved in whole.
  side(id, slot, profile, z): outer.band(id, slot, profile, function(inset) [z[0] - inset, z[1] - inset]),
  // `band` across the centre line, `half` at the waist.
  across(id, slot, profile, half): outer.band(id, slot, profile, function(inset) [inset - half, half - inset]),

  chamfer: std.get(s, 'archChamfer', std.round(s.arch * 0.5 / grain) * grain),
  local c = outer.chamfer,
  aftCorner(id, slot, axle, z, top=s.archTop):
    local x = axle - s.arch;
    k.prism(id, slot, [[x, top - c], [x + c, top], [x, top]], z),
  foreCorner(id, slot, axle, z, top=s.archTop):
    local x = axle + s.arch;
    k.prism(id, slot, [[x, top - c], [x, top], [x - c, top]], z),
  // The arch's inner roof and wall, cut to the same five sides, so no square hole shows behind the panel. `thick` is
  // measured up from the opening.
  liner(id, slot, axle, low, zRoof, zWall, thick=0.0625, top=s.archTop):
    local x0 = axle - s.arch;
    local x1 = axle + s.arch;
    [
      k.box(id + '_top', slot, [x0 + c, top, zRoof[0]], [x1 - c, top + thick, zRoof[1]]),
      k.prism(id + '_top_aft', slot, [[x0, top - c], [x0 + c, top], [x0 + c, top + thick], [x0, top - c + thick]], zRoof),
      k.prism(id + '_top_fore', slot, [[x1 - c, top], [x1, top - c], [x1, top - c + thick], [x1 - c, top + thick]], zRoof),
      k.prism(id + '_wall', slot, [[x0, low], [x1, low], [x1, top - c + thick], [x1 - c, top + thick], [x0 + c, top + thick], [x0, top - c + thick]], zWall),
    ],
  // A moulded lip round the opening, `out` past it and `over` into it, from `low` up.
  flare(id, slot, axle, low, z, out, over, half=0.03):
    local x0 = axle - s.arch;
    local x1 = axle + s.arch;
    local top = s.archTop;
    [
      k.box(id + '_top', slot, [x0 + c, top - half, z[0]], [x1 - c, top + half, z[1]]),
      k.prism(id + '_aft_slant', slot, [[x0 - out, top - c], [x0 + over, top - c], [x0 + c, top - half], [x0 + c, top + half]], z),
      k.prism(id + '_fore_slant', slot, [[x1 - over, top - c], [x1 + out, top - c], [x1 - c, top + half], [x1 - c, top - half]], z),
      k.box(id + '_back', slot, [x0 - out, low, z[0]], [x0 + over, top - c, z[1]]),
      k.box(id + '_fore', slot, [x1 - over, low, z[0]], [x1 + out, top - c, z[1]]),
    ],
}
