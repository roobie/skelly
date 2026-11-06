// Row helpers shared by catalogue batches, so each batch file holds only its own rows.
local params(values) = { [key]: if std.type(values[key]) == 'array' then std.manifestJson(values[key]) else std.toString(values[key]) for key in std.objectFields(values) };
local item(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
// A cylinder along x from `x0` to `x1`, its axis at height `y`.
local rod(id, slot, radius, x0, x1, y) = { id: id, slot: slot, kind: 'turned', axis: 'x', profile: [[0, 0], [0, radius], [x1 - x0, radius], [x1 - x0, 0]], origin: [x0, y, 0] };
{
  item: item,
  compound(id, massKg, pieces, finish): item(id, 'compound', massKg, { pieces: pieces }, finish),
  box(id, slot, min, max): { id: id, slot: slot, kind: 'box', min: min, max: max },
  turned(id, slot, axis, profile, origin=null): { id: id, slot: slot, kind: 'turned', axis: axis, profile: profile } + (if origin == null then {} else { origin: origin }),
  // The compound check takes counterclockwise outlines only, so a clockwise one is turned round here. On the y axis
  // the outline's points are [z, x], not [x, z]: `g.flat` in garments.libsonnet swaps them for an [x, z] outline.
  prism(id, slot, axis, profile, start, end):
    local n = std.length(profile);
    local area = std.sum([profile[i][0] * profile[(i + 1) % n][1] - profile[(i + 1) % n][0] * profile[i][1] for i in std.range(0, n - 1)]);
    { id: id, slot: slot, kind: 'prism', axis: axis, profile: if area > 0 then profile else std.reverse(profile), start: start, end: end },
  rod: rod,
  // A syringe lying along x with its needle cap at +x, for a vaccine, an oil dose or a drawn injection. `dose` is the
  // filled share of the barrel. Slots: barrel, dose, stopper, plunger, hub, cap.
  syringe(length, radius, dose=0.8, capLength=null):
    local half = length / 2, y = radius * 1.5, stopper = std.max(0.003, length * 0.06), cap = if capLength == null then length * 0.6 else capLength;
    [
      rod('barrel', 'barrel', radius, -half, half, y),
      rod('dose', 'dose', radius * 0.85, -half + stopper, -half + stopper + dose * (length - stopper), y),
      rod('stopper', 'stopper', radius * 0.95, -half, -half + stopper, y),
      { id: 'flange', slot: 'barrel', kind: 'box', min: [-half - 0.002, y - radius * 0.4, -radius * 2.4], max: [-half, y + radius * 0.4, radius * 2.4] },
      rod('rod', 'plunger', radius * 0.5, -half - length * 0.6, -half - 0.002, y),
      rod('thumb', 'plunger', radius * 1.4, -half - length * 0.6 - 0.003, -half - length * 0.6, y),
      rod('hub', 'hub', radius * 0.6, half, half + 0.006, y),
      { id: 'cap', slot: 'cap', kind: 'turned', axis: 'x', profile: [[0, 0], [0, radius * 0.6], [cap, radius * 0.5], [cap, 0]], origin: [half + 0.006, y, 0] },
    ],
  // A pen-shaped autoinjector lying along x with its safety cap at +x and the needle end at -x, a dose
  // window on top. Slots: body, cap, tip, window.
  penInjector(length, radius, capLength=null):
    local half = length / 2, cap = if capLength == null then length * 0.25 else capLength, tip = std.max(0.006, length * 0.05);
    [
      rod('body', 'body', radius, -half + tip, half - cap, radius),
      rod('cap', 'cap', radius * 1.05, half - cap, half, radius * 1.05),
      rod('tip', 'tip', radius * 0.85, -half, -half + tip, radius),
      { id: 'window', slot: 'window', kind: 'box', min: [-half + tip + length * 0.15, radius * 1.6, -radius * 0.5], max: [-half + tip + length * 0.35, radius * 2.05, radius * 0.5] },
    ],
  // A low domed tablet, slot tablet, for `blister`.
  tablet(radius): function(id, x, z, y0) [
    { id: id, slot: 'tablet', kind: 'turned', axis: 'y', profile: [[0, 0], [0, radius], [0.0015, radius], [0.003, radius * 0.7], [0.003, 0]], origin: [x, y0, z] },
  ],
  // A two-tone capsule lying along z, slots capsule-a and capsule-b, for `blister`.
  capsule(length, radius): function(id, x, z, y0) [
    { id: id + '-a', slot: 'capsule-a', kind: 'turned', axis: 'z', profile: [[0, 0], [0, radius * 0.6], [radius * 0.5, radius], [length / 2, radius], [length / 2, 0]], origin: [x, y0 + radius, z - length / 2] },
    { id: id + '-b', slot: 'capsule-b', kind: 'turned', axis: 'z', profile: [[0, 0], [0, radius], [length / 2 - radius * 0.5, radius], [length / 2, radius * 0.6], [length / 2, 0]], origin: [x, y0 + radius, z] },
  ],
  // A blister card lying flat, `length` along x, with a printed band at -x and `columns` by `rows` pills
  // from `h.tablet` or `h.capsule`. Slots: foil, print, and the pill's own.
  blister(length, width, columns, rows, pill):
    local band = length * 0.12, x0 = -length / 2 + band, dx = (length - band) / columns, dz = width / rows;
    [
      { id: 'card', slot: 'foil', kind: 'box', min: [-length / 2, 0, -width / 2], max: [length / 2, 0.002, width / 2] },
      { id: 'print', slot: 'print', kind: 'box', min: [-length / 2, 0.002, -width / 2], max: [x0, 0.0025, width / 2] },
    ] + std.flattenArrays([
      pill('pill-%d-%d' % [i, j], x0 + dx * (i + 0.5), -width / 2 + dz * (j + 0.5), 0.002)
      for i in std.range(0, columns - 1)
      for j in std.range(0, rows - 1)
    ]),
  // A sealed flat sachet lying along x with crimped ends. Slots: pouch, crimp.
  sachet(length, width, thickness): [
    { id: 'pouch', slot: 'pouch', kind: 'box', min: [-length / 2 + 0.005, 0, -width / 2], max: [length / 2 - 0.005, thickness, width / 2] },
    { id: 'crimp-a', slot: 'crimp', kind: 'box', min: [-length / 2, thickness * 0.35, -width / 2], max: [-length / 2 + 0.005, thickness * 0.65, width / 2] },
    { id: 'crimp-b', slot: 'crimp', kind: 'box', min: [length / 2 - 0.005, thickness * 0.35, -width / 2], max: [length / 2, thickness * 0.65, width / 2] },
  ],
  // A cylinder standing on y from `y0` to `y1`, centred at (x, z).
  disc(id, slot, radius, y0, y1, x=0, z=0): { id: id, slot: slot, kind: 'turned', axis: 'y', profile: [[0, 0], [0, radius], [y1 - y0, radius], [y1 - y0, 0]], origin: [x, y0, z] },
  // A turned ring off its axis must close its outline on its first point, or the hole fills.
  // A garment folded flat on a shelf, `width` along x and `depth` along z, with `folds` stacked layers whose
  // front edges roll over, so a shirt, jumper or trousers reads as folded cloth. Slot: cloth.
  // A hollow tube along x from `x0` to `x1`, radii `r0` to `r1`, its axis at (y, z).
  tube(id, slot, r0, r1, x0, x1, y=0, z=0): self.turned(id, slot, 'x', [[0, r0], [0, r1], [x1 - x0, r1], [x1 - x0, r0], [0, r0]], [x0, y, z]),
  // Hex-packed centres for a bundle of rods of radius `r` along x: rows of the given counts, the bottom row on the floor.
  hexPack(r, rows): std.flattenArrays([
    [{ y: r + i * 2 * r * 0.866, z: (j - (rows[i] - 1) / 2) * 2 * r } for j in std.range(0, rows[i] - 1)]
    for i in std.range(0, std.length(rows) - 1)
  ]),
  // A closed pouch standing on y, `w` along x, `d` deep with its front on +z, under a flap that wraps the top and
  // comes `flap` down the front, with `back` vertical straps behind for a belt or vest. Slots: body, flap, strap.
  pouch(w, ht, d, flap, back=2, t=0.003): [
    $.box('body', 'body', [-w / 2, 0, -d / 2], [w / 2, ht, d / 2]),
    $.box('flap-top', 'flap', [-w / 2 - t, ht, -d / 2], [w / 2 + t, ht + t, d / 2 + t]),
    $.box('flap-front', 'flap', [-w / 2 - t, ht - flap, d / 2], [w / 2 + t, ht, d / 2 + t]),
  ] + [
    $.box('back-strap-%d' % i, 'strap', [x - 0.0125, ht * 0.15, -d / 2 - 0.004], [x + 0.0125, ht * 0.95, -d / 2])
    for i in std.range(0, back - 1)
    for x in [if back == 1 then 0 else -w * 0.25 + i * w * 0.5 / (back - 1)]
  ],
  // A press stud at (x, y) standing `t` proud of a front face at `z`.
  stud(id, slot, x, y, z, r=0.007, t=0.004): $.turned(id, slot, 'z', [[0, 0], [0, r], [t * 0.5, r], [t, r * 0.6], [t, 0]], [x, y, z]),
  // Rows of webbing 25 mm tall from `x0` to `x1` at heights `ys` across a face at `z`, for attaching pouches.
  webbing(prefix, slot, x0, x1, ys, z, t=0.003): [
    $.box('%s-%d' % [prefix, i], slot, [x0, ys[i], z], [x1, ys[i] + 0.025, z + t])
    for i in std.range(0, std.length(ys) - 1)
  ],
  foldedGarment(width, depth, height, folds=3):
    local t = height / folds, r = t / 2;
    std.flattenArrays([
      local inset = (i % 2) * std.min(0.006, width * 0.03);
      [
        { id: 'fold-%d' % i, slot: 'cloth', kind: 'box', min: [-width / 2 + inset, i * t, -depth / 2 + r], max: [width / 2 - inset, (i + 1) * t, depth / 2] },
        { id: 'edge-%d' % i, slot: 'cloth', kind: 'turned', axis: 'x', profile: [[0, 0], [0, r], [width - 2 * inset, r], [width - 2 * inset, 0]], origin: [-width / 2 + inset, i * t + r, -depth / 2 + r] },
      ]
      for i in std.range(0, folds - 1)
    ]),
  // A steel or plastic drum standing on y with rolled chimes. `hoops` rolling hoops ring the body; a closed
  // head carries two bungs in its top, an open head a bolted clamp ring. Slots: body, chime, and bung or clamp.
  drum(radius, height, hoops=2, closedHead=true):
    local chime = std.min(0.012, radius * 0.05), lip = 0.02;
    [
      { id: 'body', slot: 'body', kind: 'turned', axis: 'y', profile: [[0, 0], [0, radius - chime], [chime, radius], [height - chime, radius], [height, radius - chime], [height, 0]] },
      { id: 'chime-top', slot: 'chime', kind: 'turned', axis: 'y', profile: [[0, radius * 0.92], [0, radius + 0.004], [lip, radius + 0.004], [lip, radius * 0.92], [0, radius * 0.92]], origin: [0, height - lip, 0] },
      { id: 'chime-foot', slot: 'chime', kind: 'turned', axis: 'y', profile: [[0, radius * 0.92], [0, radius + 0.004], [lip * 0.7, radius + 0.004], [lip * 0.7, radius * 0.92], [0, radius * 0.92]] },
    ] + [
      { id: 'hoop-%d' % i, slot: 'body', kind: 'turned', axis: 'y', profile: [[0, 0], [0, radius + 0.01], [0.02, radius + 0.01], [0.02, 0]], origin: [0, height * i / (hoops + 1) - 0.01, 0] }
      for i in std.range(1, hoops)
    ] + (
      if closedHead then [
        self.disc('bung-large', 'bung', radius * 0.12, height - 0.01, height + 0.02, radius * 0.6, 0),
        self.disc('bung-small', 'bung', radius * 0.085, height - 0.01, height + 0.02, -radius * 0.6, 0),
      ] else [
        { id: 'clamp', slot: 'clamp', kind: 'turned', axis: 'y', profile: [[0, radius * 0.95], [0, radius + 0.012], [0.03, radius + 0.012], [0.03, radius * 0.95], [0, radius * 0.95]], origin: [0, height - 0.03, 0] },
        { id: 'clamp-bolt', slot: 'clamp', kind: 'box', min: [radius, height - 0.035, -0.03], max: [radius + 0.04, height + 0.005, 0.03] },
      ]
    ),
  // The part of an [x, z] outline on one side of x = a, without repeated points.
  clipX(poly, a, above):
    local n = std.length(poly);
    local ins(p) = if above then p[0] >= a - 1e-9 else p[0] <= a + 1e-9;
    local raw = std.flattenArrays([
      local p = poly[i];
      local q = poly[(i + 1) % n];
      (if ins(p) then [p] else [])
      + (if ins(p) != ins(q) then [[a, p[1] + (q[1] - p[1]) * (a - p[0]) / (q[0] - p[0])]] else [])
      for i in std.range(0, n - 1)
    ]);
    local m = std.length(raw);
    [raw[i] for i in std.range(0, m - 1) if m > 0 && (std.abs(raw[i][0] - raw[(i + 1) % m][0]) > 1e-6 || std.abs(raw[i][1] - raw[(i + 1) % m][1]) > 1e-6)],
  local halfWidth(poly) = std.max(-std.foldl(function(a, p) std.min(a, p[0]), poly, 1e9), std.foldl(function(a, p) std.max(a, p[0]), poly, -1e9)),
  // A plate lying convex side up and curved across x with radius `r`: its [x, z] outline, centred on its middle, is
  // cut into `n` strips so the edges rest at y0 and the middle stands proud. Prisms must be convex, so a curved shell
  // is built from strips. A layer laid on a wider plate passes that plate's half-width as `curveHalf`.
  curvedPlate(prefix, slot, outline, y0, thick, r, n, cx=0, cz=0, curveHalf=null):
    local x0 = std.foldl(function(a, p) std.min(a, p[0]), outline, 1e9);
    local x1 = std.foldl(function(a, p) std.max(a, p[0]), outline, -1e9);
    local half = if curveHalf == null then halfWidth(outline) else curveHalf;
    local w = (x1 - x0) / n;
    [
      local xa = x0 + i * w;
      local band = $.clipX($.clipX(outline, xa, true), xa + w, false);
      local mid = xa + w / 2;
      local s = (half * half - mid * mid) / (2 * r);
      $.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in band], y0 + s, y0 + s + thick)
      for i in std.range(0, n - 1)
    ],
  // Height of a curvedPlate's top face at local x.
  curvedTopAt(outline, y0, thick, r, x): local half = halfWidth(outline); y0 + thick + (half * half - x * x) / (2 * r),
  // A strip `w` wide lying on a curvedPlate's face from [xa, za] to [xb, zb]: cracks, labels, straps and seams.
  onCurvedFace(id, slot, outline, y0, thick, r, a, b, w=0.004, cx=0, cz=0):
    local dx = b[0] - a[0];
    local dz = b[1] - a[1];
    local len = std.sqrt(dx * dx + dz * dz);
    local nx = -dz / len * w / 2;
    local nz = dx / len * w / 2;
    local y = $.curvedTopAt(outline, y0, thick, r, (a[0] + b[0]) / 2);
    $.prism(id, slot, 'y', [[a[1] + nz + cz, a[0] + nx + cx], [b[1] + nz + cz, b[0] + nx + cx], [b[1] - nz + cz, b[0] - nx + cx], [a[1] - nz + cz, a[0] - nx + cx]], y - 0.003, y + 0.002),
  // A flat crescent between radii r0 and r1 over [a0, a1] degrees (0 points to +z), lying on y from y0 to y1, built
  // from `steps` convex quads because prisms must be convex. For collars, neck cut-outs and arcs.
  crescent(prefix, slot, r0, r1, a0, a1, steps, y0, y1, cx=0, cz=0):
    local ang(i) = (a0 + (a1 - a0) * i / steps) * std.pi / 180;
    local pt(r, i) = [r * std.sin(ang(i)) + cx, r * std.cos(ang(i)) + cz];
    [
      $.prism('%s-%d' % [prefix, i], slot, 'y', [[q[1], q[0]] for q in [pt(r1, i), pt(r1, i + 1), pt(r0, i + 1), pt(r0, i)]], y0, y1)
      for i in std.range(0, steps - 1)
    ],
  // Webbing rows 25 mm wide lying on a flat, upward face at height y, along x from x0 to x1, at each z in zs; for gear
  // laid flat, outside up. `webbing` draws them on an upright face instead.
  webbingFlat(prefix, slot, x0, x1, zs, y, t=0.003): [
    $.box('%s-%d' % [prefix, i], slot, [x0, y, zs[i]], [x1, y + t, zs[i] + 0.025])
    for i in std.range(0, std.length(zs) - 1)
  ],
  // A strap `w` wide and `t` thick lying flat on y as a closed loop: two straight runs `length` long along x joined by
  // half-round ends of centre radius `r`, centred on [cx, cz]. For bandoliers, slings and belts laid out.
  strapLoop(prefix, slot, length, r, w, t, y=0, cx=0, cz=0, steps=8):
    [
      $.box(prefix + '-near', slot, [cx - length / 2, y, cz + r - w / 2], [cx + length / 2, y + t, cz + r + w / 2]),
      $.box(prefix + '-far', slot, [cx - length / 2, y, cz - r - w / 2], [cx + length / 2, y + t, cz - r + w / 2]),
    ]
    + $.crescent(prefix + '-right', slot, r - w / 2, r + w / 2, 0, 180, steps, y, y + t, cx + length / 2, cz)
    + $.crescent(prefix + '-left', slot, r - w / 2, r + w / 2, 180, 360, steps, y, y + t, cx - length / 2, cz),
  // A domed shell `t` thick: a spherical cap `a` in rim radius and `h` high, turned about `axis` with its rim at
  // `origin` and its crown along the positive axis. For knee and elbow cups, helmet crowns and bowls.
  dome(id, slot, a, h, t, axis='y', origin=null, steps=8):
    local R = (a * a + h * h) / (2 * h);
    local c = h - R;
    local rAt(rad, y) = std.sqrt(std.max(0, rad * rad - (y - c) * (y - c)));
    local outer = [[h * i / steps, rAt(R, h * i / steps)] for i in std.range(0, steps)];
    local inner = [[(h - t) * (steps - i) / steps, rAt(R - t, (h - t) * (steps - i) / steps)] for i in std.range(0, steps)];
    $.turned(id, slot, axis, outer + inner + [outer[0]], origin),
  // A ball of radius `r` turned about y, its centre at [x, y, z]; `squash` scales its height. For pebbles, knobs,
  // lobes and balls.
  ball(id, slot, r, x, y, z, squash=1, steps=8):
    local pts = [
      local a = std.pi * i / steps;
      [r * squash * (1 - std.cos(a)), r * std.sin(a)]
      for i in std.range(0, steps)
    ];
    $.turned(id, slot, 'y', [[0, 0]] + pts[1:std.length(pts) - 1] + [[2 * r * squash, 0]], [x, y - r * squash, z]),
  // The same pieces raised `dy` along y, so a shell authored on a body frame stands on the floor as its ground model.
  lifted(pieces, dy): [
    p + (
      if p.kind == 'box' then { min: [p.min[0], p.min[1] + dy, p.min[2]], max: [p.max[0], p.max[1] + dy, p.max[2]] }
      else if p.kind == 'prism' then (
        if p.axis == 'y' then { start: p.start + dy, end: p.end + dy }
        else if p.axis == 'z' then { profile: [[q[0], q[1] + dy] for q in p.profile] }
        else { profile: [[q[0] + dy, q[1]] for q in p.profile] }
      )
      else { origin: local o = std.get(p, 'origin', [0, 0, 0]); [o[0], o[1] + dy, o[2]] }
    )
    for p in pieces
  ],
  // The same pieces made k times larger about the origin, for oversized cuts of a model.
  scaled(pieces, k): [
    p + (
      if p.kind == 'box' then { min: [v * k for v in p.min], max: [v * k for v in p.max] }
      else if p.kind == 'prism' then { profile: [[v * k for v in q] for q in p.profile], start: p.start * k, end: p.end * k }
      else { profile: [[v * k for v in q] for q in p.profile] } + (if std.objectHas(p, 'origin') then { origin: [v * k for v in p.origin] } else {})
    )
    for p in pieces
  ],
  // curvedPlate with each strip filled down to the height of its outer edge, so neighbouring strips meet without a
  // see-through step and the shell reads as one curved sheet. Tops match curvedTopAt.
  smoothPlate(prefix, slot, outline, y0, thick, r, n, cx=0, cz=0):
    local x0 = std.foldl(function(a, p) std.min(a, p[0]), outline, 1e9);
    local x1 = std.foldl(function(a, p) std.max(a, p[0]), outline, -1e9);
    local half = std.max(-x0, x1), w = (x1 - x0) / n;
    local lift(x) = (half * half - x * x) / (2 * r);
    [
      local xa = x0 + i * w;
      local band = $.clipX($.clipX(outline, xa, true), xa + w, false);
      local outer = if std.abs(xa) > std.abs(xa + w) then xa else xa + w;
      $.prism('%s-%d' % [prefix, i], slot, 'y', [[p[1] + cz, p[0] + cx] for p in band], y0 + lift(outer), y0 + lift(xa + w / 2) + thick)
      for i in std.range(0, n - 1)
    ],
  // A strip `w` wide lying across a curved plate at local z, `half` either side of its middle, piece by piece so it
  // follows the curve; each piece stands on the higher of its two ends so the shell never covers it. Rims, edges and
  // straps across smoothPlate or curvedPlate shells.
  plateBand(prefix, slot, outline, y0, t, r, cx, cz, z, half, w, n=6): [
    local xa = -half + 2 * half * i / n, xb = -half + 2 * half * (i + 1) / n;
    local top = $.curvedTopAt(outline, y0, t, r, if xa < 0 && xb > 0 then 0 else std.min(std.abs(xa), std.abs(xb)));
    $.box('%s-%d' % [prefix, i], slot, [cx + xa, top - 0.004, cz + z - w / 2], [cx + xb, top + 0.002, cz + z + w / 2])
    for i in std.range(0, n - 1)
  ],
  // A chestplate or cuirass laid front up on its backplate, neck towards -z: a breastplate `w` across and `l` from
  // the neck edge to the hem, curved across x with radius `r`, its neck edge `neck` either side of the middle and its
  // armholes cut `arm` down the sides. Options, each off by default unless noted: ridge (on) down the middle; rim (on)
  // rolled at the neck and armholes; straps (on) buckled over the shoulders and at the sides; lames below the hem;
  // tassets (two lames over each thigh, hung from the lowest lame); spaulder (lames arched over each upper arm);
  // plackart (a second plate riveted over the belly); edgeRivets round the edge; dents ([x, z] hammer marks).
  // Slots: plate, back, rim, strap, buckle, rivet, dent.
  chestplate(o={}):
    local c = {
      w: 0.4, l: 0.36, t: 0.004, r: 0.3, n: 14, neck: 0.11, arm: 0.08,
      ridge: true, rim: true, straps: true, lames: 0, tassets: false, spaulder: 0, plackart: false, edgeRivets: false, dents: [],
    } + o;
    local w = c.w, l = c.l, t = c.t, r = c.r, hw = w / 2, zn = -l / 2, zh = l / 2;
    local yb = 0.008;
    local front = [[-c.neck, zn], [c.neck, zn], [hw, zn + c.arm], [hw, zh], [-hw, zh], [-hw, zn + c.arm]];
    local top(x) = $.curvedTopAt(front, yb, t, r, x);
    local face(id, slot, a, b, wd) = $.onCurvedFace(id, slot, front, yb, t, r, a, b, wd);
    local rivet(id, x, y, z) = $.box(id, 'rivet', [x - 0.004, y - 0.001, z - 0.004], [x + 0.004, y + 0.004, z + 0.004]);
    local sides = [['l', -1], ['r', 1]];
    local lameEnd = zh - 0.01 + c.lames * 0.045;
    local rect(rw, rl) = [[-rw / 2, -rl / 2], [rw / 2, -rl / 2], [rw / 2, rl / 2], [-rw / 2, rl / 2]];
    [$.prism('back', 'back', 'y', [[q[1], q[0] * 1.03] for q in front], 0, yb)]
    + $.smoothPlate('breast', 'plate', front, yb, t, r, c.n)
    + (if c.ridge then [face('ridge', 'rim', [0, zn + 0.03], [0, zh - 0.01], 0.01)] else [])
    + (if c.rim then
         $.plateBand('neck-rim', 'rim', front, yb, t, r, 0, 0, zn + 0.01, c.neck, 0.02)
         + [face('arm-rim-' + sd[0], 'rim', [sd[1] * (c.neck + 0.01), zn + 0.005], [sd[1] * (hw - 0.003), zn + c.arm], 0.012) for sd in sides]
       else [])
    + [face('dent-%d' % i, 'dent', [c.dents[i][0] - 0.012, c.dents[i][1]], [c.dents[i][0] + 0.012, c.dents[i][1]], 0.022) for i in std.range(0, std.length(c.dents) - 1)]
    + (if c.edgeRivets then [
         rivet('edge-rivet-%d' % i, p[0], top(p[0]) - 0.003, p[1])
         for i in std.range(0, 9)
         for p in [[
           [-c.neck * 0.6, zn + 0.025], [c.neck * 0.6, zn + 0.025],
           [-hw + 0.025, zn + l * 0.45], [hw - 0.025, zn + l * 0.45], [-hw + 0.025, zn + l * 0.75], [hw - 0.025, zn + l * 0.75],
           [-hw * 0.7, zh - 0.025], [-hw * 0.25, zh - 0.025], [hw * 0.25, zh - 0.025], [hw * 0.7, zh - 0.025],
         ][i]]
       ] else [])
    // Shoulder straps from the backplate over the shoulder to a buckle on the breast, and two buckled side straps.
    + (if c.straps then std.flattenArrays([
         local s = sd[0], sx = sd[1], mx = (c.neck + hw) / 2;
         [
           $.box('shoulder-strap-' + s, 'strap', [sx * mx - 0.012, yb, zn - 0.04], [sx * mx + 0.012, top(mx) + 0.002, zn + 0.03]),
           $.box('shoulder-buckle-' + s, 'buckle', [sx * mx - 0.016, top(mx) - 0.002, zn + 0.028], [sx * mx + 0.016, top(mx) + 0.006, zn + 0.048]),
         ]
         + [face('side-strap-%s-%d' % [s, k], 'strap', [sx * hw, zn + l * [0.5, 0.8][k]], [sx * (hw - 0.05), zn + l * [0.5, 0.8][k]], 0.022) for k in [0, 1]]
         + [
           $.box('side-buckle-%s-%d' % [s, k], 'buckle', [sx * hw - 0.008, 0, zn + l * [0.5, 0.8][k] - 0.014], [sx * hw + 0.008, 0.022, zn + l * [0.5, 0.8][k] + 0.014])
           for k in [0, 1]
         ]
         for sd in sides
       ]) else [])
    // Waist lames, each a little narrower and lower than the one above, riveted at both ends.
    + std.flattenArrays([
      local z0 = zh - 0.01 + i * 0.045, half = hw - 0.01 - i * 0.012, yl = yb - 0.002 - i * 0.003;
      local ol = [[-half, 0], [half, 0], [half, 0.055], [-half, 0.055]];
      $.smoothPlate('lame-%d' % i, 'plate', ol, yl, t, r, 10, 0, z0)
      + $.plateBand('lame-edge-%d' % i, 'rim', ol, yl, t, r, 0, z0, 0.05, half - 0.004, 0.006)
      + [rivet('lame-rivet-%d-%s' % [i, sd[0]], sd[1] * (half - 0.015), $.curvedTopAt(ol, yl, t, r, half - 0.015), z0 + 0.025) for sd in sides]
      for i in std.range(0, c.lames - 1)
    ])
    + (if c.tassets then std.flattenArrays([
         local s = sd[0], sx = sd[1];
         [$.box('tasset-hanger-' + s, 'strap', [sx * hw * 0.5 - 0.01, 0, lameEnd - 0.03], [sx * hw * 0.5 + 0.01, 0.012, lameEnd + 0.02])]
         + std.flattenArrays([
           local ol = [[-0.08, 0], [0.08, 0], [0.075, 0.065], [-0.075, 0.065]], z0 = lameEnd + 0.01 + k * 0.055;
           $.smoothPlate('tasset-%s-%d' % [s, k], 'plate', ol, 0.004 - k * 0.002, t, 0.2, 8, sx * hw * 0.5, z0)
           + $.plateBand('tasset-edge-%s-%d' % [s, k], 'rim', ol, 0.004 - k * 0.002, t, 0.2, sx * hw * 0.5, z0, 0.06, 0.07, 0.006)
           for k in [0, 1]
         ])
         for sd in sides
       ]) else [])
    + (if c.spaulder > 0 then std.flattenArrays([
         local ol = rect(0.12, 0.05), z0 = zn + 0.03 + k * 0.04, s = sd[0], sx = sd[1];
         $.smoothPlate('spaulder-%s-%d' % [s, k], 'plate', ol, 0.012 - k * 0.004, t, 0.09, 8, sx * (hw + 0.07), z0)
         + $.plateBand('spaulder-edge-%s-%d' % [s, k], 'rim', ol, 0.012 - k * 0.004, t, 0.09, sx * (hw + 0.07), z0, -0.022, 0.055, 0.006)
         for sd in sides
         for k in std.range(0, c.spaulder - 1)
       ]) + [
         $.box('spaulder-strap-' + sd[0], 'strap', [sd[1] * (hw + 0.03) - 0.01, 0, zn + 0.02], [sd[1] * (hw + 0.03) + 0.01, 0.014, zn + 0.06])
         for sd in sides
       ] else [])
    + (if c.plackart then
         local px = hw * 0.85;
         local pl = [[-hw * 0.65, zh - 0.14], [hw * 0.65, zh - 0.14], [px, zh - 0.06], [px, zh], [-px, zh], [-px, zh - 0.06]];
         local yp = yb + (hw * hw - px * px) / (2 * r) + t;
         $.smoothPlate('plackart', 'plate', pl, yp, t, r, 12)
         + [
           rivet('plackart-rivet-%d' % i, p[0], $.curvedTopAt(pl, yp, t, r, p[0]), p[1])
           for i in std.range(0, 3)
           for p in [[[-hw * 0.5, zh - 0.12], [hw * 0.5, zh - 0.12], [-px + 0.03, zh - 0.02], [px - 0.03, zh - 0.02]][i]]
         ]
       else []),
  // A small thing held upright in the hand by its named solid, as the medicine bottles in food-medical.libsonnet are.
  inHand(id, solid): { handling: { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 } },
  // A held tool lies along x and takes its grip on a named solid.
  gripOn(id, solid): { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 90 },
}
