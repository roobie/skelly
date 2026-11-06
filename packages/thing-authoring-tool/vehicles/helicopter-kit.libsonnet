// Pressings the helicopters share. Pieces go inside a vehicle's own `k.compound`; a function that takes `massKg` is a
// whole part. A section is { x, top, bottom, half, waist? }: y of its crown and keel, half width in z, and the height
// its widest point sits at, by default midway. Arcs run in degrees from the crown (0) toward the near side (90) to the
// keel (180) and on round the far side (270), so [-90, 90] is the part above the waist and [90, 270] the part below.
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local rad(degrees) = degrees * std.pi / 180;
local xPrism(id, slot, profile, x) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: x[0], end: x[1] };
local yPrism(id, slot, profile, y) = { id: id, kind: 'prism', slot: slot, axis: 'y', profile: profile, start: y[0], end: y[1] };

local turn(o, a, b) = (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
local unwound(chain, p) =
  local n = std.length(chain);
  if n >= 2 && turn(chain[n - 2], chain[n - 1], p) <= 1e-9 then unwound(chain[:n - 1], p) else chain;
local walk(points) = std.foldl(function(chain, p) unwound(chain, p) + [p], points, []);
// Radial trapezoids between two unlike curves can dent, and a prism must be convex and counterclockwise, so every
// profile goes through its hull.
local hull(points) =
  local sorted = std.sort(points, function(p) std.round(p[0] * 1e4) * 1e4 + p[1]);
  local lower = walk(sorted);
  local upper = walk(std.reverse(sorted));
  lower[:std.length(lower) - 1] + upper[:std.length(upper) - 1];
local area(polygon) =
  local n = std.length(polygon);
  std.foldl(function(sum, i) sum + turn([0, 0], polygon[i], polygon[(i + 1) % n]), std.range(0, n - 1), 0) / 2;
local solidProfile(points) =
  local polygon = hull(points);
  if std.length(polygon) >= 3 && area(polygon) > 1e-5 then polygon else null;

// A monotone cubic through the stations, so a fuselage stays smooth without overshooting into a dent or a bulge.
local slopes(xs, ys) = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in std.range(0, std.length(xs) - 2)];
local tangents(d) =
  local n = std.length(d);
  [d[0]] + [
    if d[i - 1] * d[i] <= 0 then 0 else 2 * d[i - 1] * d[i] / (d[i - 1] + d[i])
    for i in std.range(1, n - 1)
  ] + [d[n - 1]];
local hermite(xs, ys, x) =
  local n = std.length(xs);
  local at = std.clamp(x, xs[0], xs[n - 1]);
  local j = std.foldl(function(found, i) if xs[i] <= at then i else found, std.range(0, n - 2), 0);
  local d = slopes(xs, ys);
  local t = tangents(d);
  local span = xs[j + 1] - xs[j];
  local u = (at - xs[j]) / span;
  (2 * u * u * u - 3 * u * u + 1) * ys[j]
  + (u * u * u - 2 * u * u + u) * span * t[j]
  + (-2 * u * u * u + 3 * u * u) * ys[j + 1]
  + (u * u * u - u * u) * span * t[j + 1];
local ordered(stations) = std.sort([
  { waist: (station.top + station.bottom) / 2 } + station
  for station in stations
], function(station) station.x);
local sectionOf(sorted, x) =
  local xs = [station.x for station in sorted];
  local field(name) = hermite(xs, [station[name] for station in sorted], x);
  { top: field('top'), bottom: field('bottom'), half: std.max(field('half'), 0), waist: field('waist') };

local signedPower(v, power) = (if v < 0 then -1 else 1) * std.pow(std.abs(v), power);
local outlinePoint(section, degrees, square) =
  local c = signedPower(std.cos(rad(degrees)), 2 / square);
  local s = signedPower(std.sin(rad(degrees)), 2 / square);
  [section.waist + c * (if c >= 0 then section.top - section.waist else section.waist - section.bottom), section.half * s];
local outline(section, arc, sides, square) =
  local n = std.max(1, std.ceil(sides * (arc[1] - arc[0]) / 360 - 1e-9));
  [outlinePoint(section, arc[0] + (arc[1] - arc[0]) * i / n, square) for i in std.range(0, n)];
local slices(range, step) =
  local n = std.max(1, std.ceil((range[1] - range[0]) / step - 1e-9));
  local width = (range[1] - range[0]) / n;
  [[range[0] + i * width, range[0] + (i + 1) * width] for i in std.range(0, n - 1)];
local spanOf(sorted, x) = if x == null then [sorted[0].x, sorted[std.length(sorted) - 1].x] else x;

local loft(id, slot, stations, x=null, arc=[-180, 180], step=0.0625, sides=16, square=2.4) =
  local sorted = ordered(stations);
  std.prune([
    local slice = slices(spanOf(sorted, x), step)[i];
    local profile = solidProfile(outline(sectionOf(sorted, (slice[0] + slice[1]) / 2), arc, sides, square));
    if profile == null then null else xPrism(id + '_' + i, slot, profile, slice)
    for i in std.range(0, std.length(slices(spanOf(sorted, x), step)) - 1)
  ]);

// The inner wall follows the narrower neighbouring slice, so a steep taper leaves no hole between slices.
local shell(id, slot, stations, thick=0.075, x=null, arc=[-180, 180], step=0.0625, sides=16, square=2.4) =
  local sorted = ordered(stations);
  local all = slices(spanOf(sorted, x), step);
  std.prune(std.flattenArrays([
    local slice = all[i];
    local mid = (slice[0] + slice[1]) / 2;
    local width = slice[1] - slice[0];
    local section = sectionOf(sorted, mid);
    local around = [sectionOf(sorted, mid - width), section, sectionOf(sorted, mid + width)];
    local up = std.min(std.min(around[0].top - around[0].waist, around[1].top - around[1].waist), around[2].top - around[2].waist);
    local down = std.min(std.min(around[0].waist - around[0].bottom, around[1].waist - around[1].bottom), around[2].waist - around[2].bottom);
    local wide = std.min(std.min(around[0].half, around[1].half), around[2].half);
    local inner = {
      waist: section.waist,
      top: section.waist + std.max(up - thick, 0),
      bottom: section.waist - std.max(down - thick, 0),
      half: std.max(wide - thick, 0),
    };
    local outer = outline(section, arc, sides, square);
    local within = outline(inner, arc, sides, square);
    [
      local profile = solidProfile([outer[j], outer[j + 1], within[j + 1], within[j]]);
      if profile == null then null else xPrism(id + '_' + i + '_' + j, slot, profile, slice)
      for j in std.range(0, std.length(outer) - 2)
    ]
    for i in std.range(0, std.length(all) - 1)
  ]));

local lerp(a, b, t) = a + (b - a) * t;
// A quad in plan, from `a` to `b`, each (x, z); a y prism's profile is (z, x).
local planQuad(a, b, halfA, halfB) =
  local dz = b[1] - a[1];
  local dx = b[0] - a[0];
  local length = std.sqrt(dz * dz + dx * dx);
  local nz = -dx / length;
  local nx = dz / length;
  [
    [a[1] - nz * halfA, a[0] - nx * halfA],
    [b[1] - nz * halfB, b[0] - nx * halfB],
    [b[1] + nz * halfB, b[0] + nx * halfB],
    [a[1] + nz * halfA, a[0] + nx * halfA],
  ];

local steel = 'paint-charcoal';

// A tube, a welded leg from a skid or wheel up under the belly, and its reflection across the centre plane.
local leg(id, slot, x, low, high, thick) = xPrism(id, slot, hull([
  [low[0], low[1] - thick / 2],
  [low[0], low[1] + thick / 2],
  [high[0], high[1] - thick / 2],
  [high[0], high[1] + thick / 2],
]), x);

local noseLeg(x, radius, width, top) =
  local crown = 2 * radius + 0.03;
  local inside = width / 2 + 0.01;
  [
    k.turned('strut', 'frame', 'y', k.disc(0.05, crown, top), [x, 0, 0]) + { sides: 8 },
    k.box('crown', 'frame', [x - 0.05, crown - 0.04, -inside - 0.04], [x + 0.05, crown + 0.02, inside + 0.04]),
    m.axleDisc('axle', 'frame', x, radius, 0.035, [-inside - 0.04, inside + 0.04], 8),
  ] + k.bothSides([
    k.box('fork', 'frame', [x - 0.04, radius - 0.03, inside], [x + 0.04, crown, inside + 0.04]),
  ]);
local mainLegs(x, radius, width, z, top, root) = k.bothSides([
  leg('strut', 'frame', [x - 0.04, x + 0.04], [radius, z - width / 2 - 0.03], [top, root], 0.07),
  m.axleDisc('stub', 'frame', x, radius, 0.04, [z - width / 2 - 0.05, z], 8),
]);

{
  section(stations, x): sectionOf(ordered(stations), x),
  // The (y, z) of a section's outline at an arc angle, for placing a rib or a hinge on the skin.
  point(stations, x, degrees, square=2.4): outlinePoint(sectionOf(ordered(stations), x), degrees, square),
  // A solid body lofted through the stations in thin slices along x; `x` and `arc` cut out a span of it.
  loft: loft,
  // The same body as a hollow wall `thick` deep, so a cabin can show its seats through glazing.
  shell: shell,
  // A straight tapered tube from `root` to `tip`, each { x, y, r }, rising or falling as they say.
  boom(id, slot, root, tip, step=0.125, sides=12)::
    loft(id, slot, [
      { x: root.x, top: root.y + root.r, bottom: root.y - root.r, half: root.r },
      { x: tip.x, top: tip.y + tip.r, bottom: tip.y - tip.r, half: tip.r },
    ], step=step, sides=sides, square=2),
  // A flat plate in the centre plane with its (x, y) outline, any order, as a tail fin is.
  fin(id, slot, outline, half=0.03): k.prism(id, slot, hull(outline), [-half, half]),
  // A rotor parked in its row, its hub at the origin: fit at the top of the mast. Blades run radially from `phase`
  // degrees off the nose, with a tip band and a droop of `droop` metres at the tip.
  mainRotor(id, massKg, radius, blades=2, chord=0.2, droop=0.22, phase=20, thick=0.0625, hub=0.14, segments=12, blade='paint-charcoal', tip='paint-crane-yellow', head='steel-grey')::
    local lift(r) = 0.03 - droop * (r / radius) * (r / radius);
    local root = hub * 0.8;
    local run = (radius - root) / segments;
    local bladePieces(b) =
      local angle = rad(phase + 360 * b / blades);
      local c = std.cos(angle);
      local sn = std.sin(angle);
      local at(r, off) = [r * sn + off * c, r * c - off * sn];
      [
        local r0 = root + i * run;
        local r1 = r0 + run;
        local half = (if i == 0 then chord * 0.3 else chord / 2);
        yPrism('blade_' + b + '_' + i, if i == segments - 1 then 'tip' else 'blade',
               hull([at(r0, -half), at(r0, half), at(r1, -half), at(r1, half)]),
               [lift(r1) - thick, lift(r0)])
        for i in std.range(0, segments - 1)
      ];
    k.compound(id, massKg, [
      k.turned('hub', 'head', 'y', k.disc(hub, -0.08, 0.04)) + { sides: 12 },
      k.turned('cap', 'head', 'y', k.disc(hub * 0.5, 0.04, 0.1)) + { sides: 8 },
    ] + std.flattenArrays([bladePieces(b) for b in std.range(0, blades - 1)]), { blade: blade, tip: tip, head: head }),
  // A tail rotor spinning in the (x, y) plane with its hub at the origin; the shaft runs `shaft` metres toward -z,
  // so fit it on the near side of the boom's end.
  tailRotor(id, massKg, radius, blades=2, chord=0.11, thick=0.05, shaft=0.14, phase=30, blade='paint-charcoal', tip='paint-crane-yellow', head='steel-grey')::
    local reach(b, r) =
      local angle = rad(phase + 360 * b / blades);
      [r * std.cos(angle), r * std.sin(angle)];
    k.compound(id, massKg, [
      k.turned('hub', 'head', 'z', k.disc(0.05, -shaft, 0.04)) + { sides: 8 },
    ] + std.flattenArrays([
      [
        m.bar('blade_' + b, 'blade', reach(b, 0.02), reach(b, radius * 0.82), chord, [-thick / 2, thick / 2]),
        m.bar('tip_' + b, 'tip', reach(b, radius * 0.82), reach(b, radius), chord, [-thick / 2, thick / 2]),
      ]
      for b in std.range(0, blades - 1)
    ]), { blade: blade, tip: tip, head: head }),
  // A mast standing from y = 0 to `length`, with a swashplate two-thirds up. Fit its foot on the gearbox.
  mast(id, massKg, length, radius=0.055, finish='steel-grey')::
    k.compound(id, massKg, [
      k.turned('shaft', 'steel', 'y', k.disc(radius, 0, length)) + { sides: 8 },
      k.turned('swash', 'steel', 'y', k.disc(radius * 2.6, length * 0.6, length * 0.6 + 0.07)) + { sides: 12 },
    ], { steel: finish }),
  // A pair of skids welded to their cross tubes, resting on y = 0. `x` is [rear, front]; `z` is each skid's offset;
  // `cross` lists { x, top, root }: where each cross tube runs and the y and half width it reaches under the belly.
  skids(id, massKg, x, z, cross, tube=0.05, sweep=0.3, finish=steel)::
    k.compound(id, massKg, std.flattenArrays([
      local c = cross[i];
      [
        k.box('cross_' + i, 'tube', [c.x - tube, c.top - 2 * tube, -c.root], [c.x + tube, c.top, c.root]),
      ] + k.bothSides([
        leg('leg_' + i, 'tube', [c.x - tube, c.x + tube], [tube, z], [c.top - tube, c.root], 2 * tube),
      ])
      for i in std.range(0, std.length(cross) - 1)
    ]) + k.bothSides([
      k.turned('skid', 'tube', 'x', k.disc(tube, x[0], x[1]), [0, tube, z]) + { sides: 8 },
      m.bar('nose', 'tube', [x[1] - tube / 2, tube], [x[1] + sweep, tube + sweep * 0.7], 2 * tube, [z - tube, z + tube]),
      m.bar('heel', 'tube', [x[0] + tube / 2, tube], [x[0] - sweep * 0.3, tube + sweep * 0.2], 2 * tube, [z - tube, z + tube]),
    ]), { tube: finish }),
  // Struts for a wheel under the nose, with a fork around it. Fit a `m.wheel` of `radius` and `width` at [x, radius, 0].
  noseGear(id, massKg, x, radius, width, top, finish=steel)::
    k.compound(id, massKg, noseLeg(x, radius, width, top), { frame: finish }),
  // A tail wheel's fork under a raked strut, with a diagonal brace running forward to `brace` { x, y } under the tail
  // cone. Fit a `m.wheel` of `radius` and `width` at [x, radius, 0].
  tailGear(id, massKg, x, radius, width, top, rake, brace, finish=steel)::
    local crown = 2 * radius + 0.03;
    local inside = width / 2 + 0.01;
    k.compound(id, massKg, [
      k.box('crown', 'frame', [x - 0.07, crown - 0.04, -inside - 0.04], [x + 0.07, crown + 0.04, inside + 0.04]),
      m.axleDisc('axle', 'frame', x, radius, 0.035, [-inside - 0.04, inside + 0.04], 8),
      m.bar('strut', 'frame', [x, crown], [x + rake, top], 0.14, [-0.07, 0.07]),
      m.bar('brace', 'frame', [x + 0.03, crown + 0.02], [brace.x, brace.y], 0.09, [-0.05, 0.05]),
    ] + k.bothSides([
      k.box('fork', 'frame', [x - 0.04, radius - 0.03, inside], [x + 0.04, crown, inside + 0.04]),
    ]), { frame: finish }),
  // Struts splayed out from the belly at half width `root` to a wheel on each side. Fit a wheel at [x, radius, z].
  mainGear(id, massKg, x, radius, width, z, top, root=0.25, finish=steel)::
    k.compound(id, massKg, mainLegs(x, radius, width, z, top, root), { frame: finish }),
  // Both of the above welded into one part, as a three-wheel undercarriage.
  threeWheelGear(id, massKg, noseX, mainX, radius, width, z, top, root=0.25, finish=steel)::
    k.compound(id, massKg, noseLeg(noseX, radius, width, top) + mainLegs(mainX, radius, width, z, top, root), { frame: finish }),
  planQuad: planQuad,
  // A strip of plate through (x, y, z) points, stepped so it stays a stack of flat slabs, as a bent blade or tube is.
  ribbon(id, slot, points, width, thick=0.08, step=0.2, endWidth=null)::
    std.flattenArrays([
      local p = points[i];
      local q = points[i + 1];
      local n = std.max(1, std.ceil(std.sqrt(std.pow(q[0] - p[0], 2) + std.pow(q[1] - p[1], 2) + std.pow(q[2] - p[2], 2)) / step));
      [
        local t0 = j / n;
        local t1 = (j + 1) / n;
        local y0 = lerp(p[1], q[1], t0);
        local y1 = lerp(p[1], q[1], t1);
        local last = i == std.length(points) - 2 && j == n - 1;
        yPrism(id + '_' + i + '_' + j, slot,
               planQuad([lerp(p[0], q[0], t0), lerp(p[2], q[2], t0)], [lerp(p[0], q[0], t1), lerp(p[2], q[2], t1)],
                        width / 2, if last && endWidth != null then endWidth / 2 else width / 2),
               [std.min(y0, y1) - thick, std.max(y0, y1)])
        for j in std.range(0, n - 1)
      ]
      for i in std.range(0, std.length(points) - 2)
    ]),
  // A turboshaft along x centred on the origin, intake forward.
  turbine(id, massKg, length, radius, finish='steel-grey', dark='steel-spall-black')::
    k.compound(id, massKg, [
      k.turned('case', 'body', 'x', [[-length / 2, 0], [-length / 2, radius * 0.6], [-length * 0.3, radius], [length * 0.3, radius], [length / 2, radius * 0.75], [length / 2, 0], [-length / 2, 0]]) + { sides: 12 },
      k.turned('exhaust', 'dark', 'x', k.disc(radius * 0.55, -length / 2 - 0.08, -length / 2)) + { sides: 12 },
      k.box('accessories', 'dark', [-length * 0.2, -radius * 1.2, -radius * 0.5], [length * 0.2, -radius * 0.6, radius * 0.5]),
    ], { body: finish, dark: dark }),
  // A flat-four along x centred on the origin, its cooling fan shroud forward.
  pistonEngine(id, massKg, length=0.7, width=0.75, height=0.5, finish='steel-grey', dark='steel-spall-black')::
    k.compound(id, massKg, [
      k.box('case', 'body', [-length / 2, -height * 0.3, -width * 0.2], [length / 2, height * 0.3, width * 0.2]),
      k.box('shroud', 'dark', [length / 2 - 0.08, -height / 2, -width / 2], [length / 2 + 0.05, height / 2, width / 2]),
      k.box('sump', 'dark', [-length * 0.35, -height / 2, -width * 0.15], [length * 0.35, -height * 0.3, width * 0.15]),
    ] + k.bothSides([
      k.turned('cylinder_' + i, 'dark', 'z', k.disc(height * 0.2, width * 0.2, width * 0.48), [length * (i - 0.5) * 0.5, 0, 0]) + { sides: 8 }
      for i in [0, 1]
    ]), { body: finish, dark: dark }),
}
