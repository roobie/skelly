// A box-bodied bus from one measurement spec: decks of equal window bays over one chassis, so each bus differs by
// its measures. `rows` builds the pressed panels; `items` and `fittings` build what a Deadvox blueprint needs from
// the same spec, taking its kit as an argument so this folder stays free of Deadvox imports.
// A door takes the place of one window bay on the near side; the driver sits on the far side, away from the kerb.
local k = import 'kit.libsonnet';
local box = k.box;
local prism = k.prism;
local axisX(id, slot, profile, from, to) = { id: id, kind: 'prism', slot: slot, axis: 'x', profile: profile, start: from, end: to };
// What is left of [lo, hi] once the cuts are taken out.
local spans(lo, hi, cuts) =
  local clipped = [[std.max(lo, c[0]), std.min(hi, c[1])] for c in cuts if c[1] > lo && c[0] < hi];
  local walked = std.foldl(
    function(acc, c) { at: std.max(acc.at, c[1]), out: acc.out + (if c[0] > acc.at + 1e-6 then [[acc.at, c[0]]] else []) },
    std.sort(clipped, function(c) c[0]),
    { at: lo, out: [] },
  );
  walked.out + (if hi > walked.at + 1e-6 then [[walked.at, hi]] else []);
local has(s, key) = std.objectHas(s, key);
// Cut from both top corners of every wheel arch, so its opening has five sides.
local archChamfer = 0.2;
local voxel = 0.03125;
local rearGlass(s) = [hole for hole in std.get(s, 'rearHoles', []) if !std.get(hole, 'door', false)];
local dashTop(s) = std.get(s, 'dashTop', s.driver.y + 0.55);
// A low-floor driver sits on a plinth, raised to see over the dash.
local plinthed(s) = s.driver.y > s.floor + 0.05;
local rearGlazed(s) = std.length(rearGlass(s)) > 0 || has(s, 'rearFlank');
local layout(s) = {
  local bonneted = has(s, 'bonnet'),
  local face = if bonneted then s.bonnet.cowl else s.front,
  local rakeFrom = s.screens[0][0],
  bonneted: bonneted,
  face: face,
  // The front leans back above the foot of the lowest windscreen.
  xf(y): face - s.lean * std.max(0, y - rakeFrom) / (s.roofBase - rakeFrom),
  panes(deck): [[deck.bayFront - (i + 1) * deck.pitch, deck.bayFront - i * deck.pitch - s.pillar] for i in std.range(0, deck.bays - 1)],
  // A door narrower than its bay keeps the bay's forward end.
  doorways: [
    local pane = self.panes(s.decks[0])[door.bay];
    [pane[1] - std.get(door, 'width', pane[1] - pane[0]), pane[1]]
    for door in s.doors
  ],
  arches: [[s.rearAxle - s.arch, s.rearAxle + s.arch]] + (if bonneted then [] else [[s.frontAxle - s.arch, s.frontAxle + s.arch]]),
  leafWidth: (self.doorways[0][1] - self.doorways[0][0]) / std.get(s, 'doorLeaves', 2),
  doorHeight: s.decks[0].top - s.doorSill,
  windowSuffix(i): if i == 0 then '_side_window' else '_upper_window',
};
local rows(id, s) = {
  local g = layout(s),
  local face = g.face,
  local xf = g.xf,
  local deck0 = s.decks[0],
  local finish = {
    paint: s.paint,
    band: std.get(s, 'band', s.paint),
    pillar: std.get(s, 'pillarFinish', s.paint),
    rail: std.get(s, 'railFinish', 'plastic-black'),
    accent: std.get(s, 'accent', s.paint),
    pan: 'paint-charcoal',
    floor: std.get(s, 'floorFinish', 'plastic-charcoal'),
    headliner: 'plastic-white',
    trim: 'plastic-black',
    glass: 'glass-clear',
  },
  // A panel reaching the front follows the rake, so no side panel stands proud of the windscreen.
  local panel(pid, slot, x0, x1, y0, y1, z) =
    if x1 >= face - 1e-3 then prism(pid, slot, [[x0, y0], [xf(y0), y0], [xf(y1), y1], [x0, y1]], z)
    else box(pid, slot, [x0, y0, z[0]], [x1, y1, z[1]]),
  local band(name, slot, ranges, y0, y1, z) = [
    panel(name + '_' + i, slot, ranges[i][0], ranges[i][1], y0, y1, z)
    for i in std.range(0, std.length(ranges) - 1)
  ],
  local deckBands(tag, z) = std.flattenArrays([
    local deck = s.decks[i];
    local panes = g.panes(deck);
    local above = if i + 1 < std.length(s.decks) then s.decks[i + 1].waist else s.roofBase;
    [
      panel(tag + '_quarter_' + i, 'paint', s.rear, panes[deck.bays - 1][0], deck.waist, deck.top, z),
      panel(tag + '_nose_pillar_' + i, 'pillar', panes[0][1] + s.pillar, face, deck.waist, deck.top, z),
      panel(tag + '_cant_' + i, 'paint', s.rear, face, deck.top, above, z),
    ] + [
      box(tag + '_pillar_' + i + '_' + j, 'pillar', [panes[j][1], deck.waist, z[0]], [panes[j][1] + s.pillar, deck.top, z[1]])
      for j in std.range(0, deck.bays - 1)
    ]
    for i in std.range(0, std.length(s.decks) - 1)
  ]),
  // A prism fills every voxel it touches and a box face rounds, so an off-grid tip would rise a voxel past the skirt.
  local fillets(tag, z) = local top = std.round(s.archTop / voxel) * voxel; std.flattenArrays([
    [
      prism(tag + '_fillet_rear_' + a[0], 'band', [[a[0], top - archChamfer], [a[0] + archChamfer, top], [a[0], top]], z),
      prism(tag + '_fillet_front_' + a[0], 'band', [[a[1], top - archChamfer], [a[1], top], [a[1] - archChamfer, top]], z),
    ]
    for a in g.arches
  ]),
  // Paint lines and rub rails stand just proud of the skin and stop at doors and, low down, at wheel arches.
  local stripes(tag, doors, z) = std.flattenArrays([
    local stripe = std.get(s, 'stripes', [])[i];
    band(tag + '_stripe_' + i, stripe.slot, spans(s.rear, face, (if stripe.y[0] < deck0.top then doors else []) + (if stripe.y[0] < s.archTop then g.arches else [])), stripe.y[0], stripe.y[1], z)
    for i in std.range(0, std.length(std.get(s, 'stripes', [])) - 1)
  ]),
  local doorFillers(z) = [
    box('door_filler_' + d, 'pillar', [g.panes(deck0)[s.doors[d].bay][0], deck0.waist, z[0]], [g.doorways[d][0], deck0.top, z[1]])
    for d in std.range(0, std.length(s.doors) - 1)
    if std.objectHas(s.doors[d], 'width')
  ],
  local side(tag, doors, z, proud) =
    band(tag + '_skirt', 'band', spans(s.rear, face, g.arches + doors), s.sill, s.archTop, z)
    + band(tag + '_lower', 'paint', spans(s.rear, face, doors), s.archTop, deck0.waist, z)
    + fillets(tag, z)
    + deckBands(tag, z)
    + stripes(tag, doors, proud),
  local wheelhouse(tag, a, well, sign) =
    local zs(lo, hi) = if sign > 0 then [lo, hi] else [-hi, -lo];
    local c = archChamfer;
    local lid = 0.06;
    local top = s.archTop;
    [
      prism(tag + '_inner', 'pan', [[a[0], s.sill], [a[1], s.sill], [a[1], top - c + lid], [a[1] - c, top + lid], [a[0] + c, top + lid], [a[0], top - c + lid]], zs(well, well + 0.05)),
      box(tag + '_lid', 'pan', [a[0] + c, top, zs(well, s.skin)[0]], [a[1] - c, top + lid, zs(well, s.skin)[1]]),
      prism(tag + '_slope_rear', 'pan', [[a[0], top - c], [a[0] + c, top], [a[0] + c, top + lid], [a[0], top - c + lid]], zs(well, s.skin)),
      prism(tag + '_slope_front', 'pan', [[a[1] - c, top], [a[1], top - c], [a[1], top - c + lid], [a[1] - c, top + lid]], zs(well, s.skin)),
      box(tag + '_end_rear', 'pan', [a[0], s.sill, zs(well, s.skin)[0]], [a[0] + 0.05, top - c, zs(well, s.skin)[1]]),
      box(tag + '_end_front', 'pan', [a[1] - 0.05, s.sill, zs(well, s.skin)[0]], [a[1], top - c, zs(well, s.skin)[1]]),
    ],
  local wheelhouses = (if g.bonneted then [] else wheelhouse('front_well_near', [s.frontAxle - s.arch, s.frontAxle + s.arch], s.frontWell, 1) + wheelhouse('front_well_far', [s.frontAxle - s.arch, s.frontAxle + s.arch], s.frontWell, -1))
    + wheelhouse('rear_well_near', [s.rearAxle - s.arch, s.rearAxle + s.arch], s.rearWell, 1)
    + wheelhouse('rear_well_far', [s.rearAxle - s.arch, s.rearAxle + s.arch], s.rearWell, -1),
  // Steps rise inward from a high-floor door to the saloon floor.
  local stepCount = std.get(s, 'doorSteps', 0),
  local stepDepth = 0.26,
  local steps = if stepCount == 0 then [] else std.flattenArrays([
    local rise = (s.floor - s.doorSill) / stepCount;
    [
      box('door_step_' + d + '_' + i, 'floor', [g.doorways[d][0], s.doorSill, s.skin - stepDepth * (i + 1)], [g.doorways[d][1], s.doorSill + rise * (i + 1), s.skin - stepDepth * i])
      for i in std.range(0, stepCount - 1)
    ]
    for d in std.range(0, std.length(g.doorways) - 1)
  ]),
  local wellInner = s.skin - stepDepth * stepCount,
  local floorFront = xf(s.floor) - voxel,
  local raised = has(s, 'floorRear'),
  local floorRearEnd = if raised then s.floorStep else s.rear,
  // A floor below a wheelhouse's lid narrows to the wells there, or its edge would lie across the tyre.
  local archWells = [{ x: g.arches[0], well: s.rearWell }] + (if g.bonneted then [] else [{ x: g.arches[1], well: s.frontWell }]),
  local slab(name, x0, x1, y0, y1) =
    if y0 >= s.archTop + 0.06 then [box(name, 'floor', [x0, y0, -s.skin], [x1, y1, s.skin])]
    else
      local runs = spans(x0, x1, g.arches);
      [
        box(name + '_' + i, 'floor', [runs[i][0], y0, -s.skin], [runs[i][1], y1, s.skin])
        for i in std.range(0, std.length(runs) - 1)
      ] + [
        box(name + '_well_' + w.x[0], 'floor', [std.max(x0, w.x[0]), y0, -w.well], [std.min(x1, w.x[1]), y1, w.well])
        for w in archWells
        if w.x[1] > x0 && w.x[0] < x1
      ],
  // Never under the sill, or the floor's edge shows as a strip below the skirt.
  local floorUnder = std.max(s.floor - 0.08, s.sill),
  local floorPieces = (
    if stepCount == 0 then slab('floor', floorRearEnd, floorFront, floorUnder, s.floor)
    else
      local runs = spans(floorRearEnd, floorFront, g.doorways);
      std.flattenArrays([
        slab('floor_' + i, runs[i][0], runs[i][1], floorUnder, s.floor)
        for i in std.range(0, std.length(runs) - 1)
      ]) + [
        box('floor_door_' + d, 'floor', [g.doorways[d][0], floorUnder, -s.skin], [g.doorways[d][1], s.floor, wellInner])
        for d in std.range(0, std.length(g.doorways) - 1)
      ]
  ) + (if raised then slab('floor_rear', s.rear, s.floorStep, s.floorRear - 0.08, s.floorRear) + [
         box('floor_riser', 'floor', [s.floorStep - 0.04, floorUnder, -s.skin], [s.floorStep, s.floorRear, s.skin]),
       ] else []) + (if has(s, 'engineDeck') then [
                       box('engine_deck', 'floor', [s.rear, s.engineDeck.y - 0.08, -s.skin], [s.engineDeck.x, s.engineDeck.y, s.skin]),
                       box('engine_deck_riser', 'floor', [s.engineDeck.x - 0.04, if has(s, 'floorRear') then s.floorRear - 0.08 else floorUnder, -s.skin], [s.engineDeck.x, s.engineDeck.y, s.skin]),
                     ] else []),
  // The rear wall is cut by its windows, bottom to top.
  local holes = std.get(s, 'rearHoles', []),
  local rearX = [s.rear, s.rear + 0.08],
  local rearBands = [
    box('rear_wall_' + i, 'paint', [rearX[0], if i == 0 then s.sill else holes[i - 1].y[1], -s.side], [rearX[1], if i == std.length(holes) then s.roofBase else holes[i].y[0], s.side])
    for i in std.range(0, std.length(holes))
  ],
  local flank = std.get(s, 'rearFlank', null),
  local rearPiece(name, y, z) = box(name, 'pillar', [rearX[0], y[0], z[0]], [rearX[1], y[1], z[1]]),
  local rearSides = k.bothSides(std.flattenArrays([
    local y = holes[i].y;
    local z = [holes[i].z, s.side];
    if flank == null then [rearPiece('rear_side_' + i, y, z)] else [
      rearPiece('rear_side_low_' + i, [y[0], flank.y[0]], z),
      rearPiece('rear_side_high_' + i, [flank.y[1], y[1]], z),
      rearPiece('rear_side_inner_' + i, flank.y, [z[0], flank.z[0]]),
      rearPiece('rear_side_outer_' + i, flank.y, [flank.z[1], z[1]]),
    ]
    for i in std.range(0, std.length(holes) - 1)
  ])),
  // The front between and above the windscreens.
  local frontWall(name, y0, y1) = prism(name, 'paint', [[xf(y0) - 0.08, y0], [xf(y0), y0], [xf(y1), y1], [xf(y1) - 0.08, y1]], [-s.skin, s.skin]),
  local screens = s.screens,
  local frontBands = [
    frontWall('front_band_' + i, screens[i][1], if i + 1 < std.length(screens) then screens[i + 1][0] else s.roofBase)
    for i in std.range(0, std.length(screens) - 1)
  ],
  local crownRoof = xf(s.roofBase),
  local wrapped = [stripe for stripe in std.get(s, 'stripes', []) if std.get(stripe, 'wrap', false)],
  local wraps = std.flattenArrays([
    local stripe = wrapped[i];
    local y = stripe.y;
    local z = [-s.side - 0.015, s.side + 0.015];
    [
      box('wrap_rear_' + i, stripe.slot, [s.rear - 0.015, y[0], z[0]], [s.rear, y[1], z[1]]),
      prism('wrap_front_' + i, stripe.slot, [[xf(y[0]), y[0]], [xf(y[0]) + 0.015, y[0]], [xf(y[1]) + 0.015, y[1]], [xf(y[1]), y[1]]], z),
    ]
    for i in std.range(0, std.length(wrapped) - 1)
  ]),
  local railFront = if g.bonneted then noseX else s.front - 0.3,
  local rails = if has(s, 'chassisRail') then [
    box('chassis_near', 'pan', [s.rear + 0.2, s.chassisRail[0], 0.42], [railFront, s.chassisRail[1], 0.52]),
    box('chassis_far', 'pan', [s.rear + 0.2, s.chassisRail[0], -0.52], [railFront, s.chassisRail[1], -0.42]),
  ] else [],
  // Dark behind the lamps, so a red lens still reads on a red body.
  local lampSurround = k.bothSides([
    box('lamp_surround', 'black', [s.rear - 0.03, s.tailLampAt[1] - 0.05, s.tailLampAt[2] - 0.12], [s.rear + 0.01, s.tailLampAt[1] + 0.53, s.tailLampAt[2] + 0.12]),
  ]),
  local shell = k.compound(id + '_shell', s.shellMass, floorPieces + steps + wheelhouses + rearBands + rearSides + frontBands + rails + wraps + lampSurround + (if std.get(s, 'openTop', false) then [] else [
    box('ceiling', 'headliner', [s.rear, s.roofBase - 0.03, -s.side], [crownRoof, s.roofBase, s.side]),
    axisX('roof', 'paint', [
      [s.roofBase, -s.side],
      [s.roofBase + (s.roof - s.roofBase) * 0.55, -s.side + 0.1],
      [s.roof, -s.side + 0.5],
      [s.roof, s.side - 0.5],
      [s.roofBase + (s.roof - s.roofBase) * 0.55, s.side - 0.1],
      [s.roofBase, s.side],
    ], s.rear, crownRoof),
  ]) + (if g.bonneted then [
         box('cowl_wall', 'paint', [face - 0.08, s.sill, -s.skin], [face, screens[0][0], s.skin]),
       ] else [])
    + side('near', g.doorways, [s.skin, s.side], [s.side, s.side + 0.015])
    + doorFillers([s.skin, s.side])
    + side('far', [], [-s.side, -s.skin], [-s.side - 0.015, -s.side]), finish + {
    black: 'plastic-black',
    yellow: 'paint-crane-yellow',
  }),
  local screenRow = k.compound(id + '_windscreen', 30 * std.length(screens), [
    // The rake's steps round differently in each prism, so the post stays a voxel inside the side panels and the glass a voxel behind that.
    prism('glass_' + i, 'glass', [[xf(screens[i][0]) - 0.11, screens[i][0]], [xf(screens[i][0]) - 2 * voxel, screens[i][0]], [xf(screens[i][1]) - 2 * voxel, screens[i][1]], [xf(screens[i][1]) - 0.11, screens[i][1]]], [-(s.side - 0.08), s.side - 0.08])
    for i in std.range(0, std.length(screens) - 1)
  ] + (if std.get(s, 'screenPost', false) then [
         prism('post', 'post', [[xf(screens[0][0]) - 0.11, screens[0][0]], [xf(screens[0][0]) - voxel, screens[0][0]], [xf(screens[0][1]) - voxel, screens[0][1]], [xf(screens[0][1]) - 0.11, screens[0][1]]], [-0.035, 0.035]),
       ] else []), { glass: 'glass-clear', post: 'plastic-black' }),
  local paneRow(i) =
    local deck = s.decks[i];
    local w = deck.pitch - s.pillar;
    local h = deck.top - deck.waist;
    k.compound(id + g.windowSuffix(i), 14 * w * h, [
      // A pane sits off the grid its pillars rounded to, so it runs a voxel behind them or daylight shows at the join.
      box('glass', 'glass', [-w / 2 - voxel, -voxel, -0.02], [w / 2 + voxel, h + voxel, 0.02]),
    ] + (if std.get(s, 'paneSash', false) then [
           box('sash', 'frame', [-w / 2, h * 0.5 - 0.025, -0.03], [w / 2, h * 0.5 + 0.025, 0.03]),
         ] else []), { glass: 'glass-clear', frame: 'steel-grey' }),
  local leafRow(suffix, hingeFraction) =
    local w = g.leafWidth;
    local h = g.doorHeight;
    local kick = std.get(s, 'doorKick', 0.3);
    local hingeSign = if hingeFraction > 0.5 then 1 else -1;
    k.compound(id + suffix, 45 * w * h, [
      box('kick', 'door', [-w / 2, 0, -0.03], [w / 2, kick, 0.03]),
      box('glass', 'glass', [-w / 2, kick, -0.015], [w / 2, h, 0.015]),
      box('stile', 'door', [hingeSign * w / 2 - 0.03, 0, -0.03], [hingeSign * w / 2 + 0.03, h, 0.03]),
      box('edge', 'door', [-hingeSign * w / 2 - 0.03, 0, -0.03], [-hingeSign * w / 2 + 0.03, h, 0.03]),
      box('head', 'door', [-w / 2, h - 0.06, -0.03], [w / 2, h, 0.03]),
    ], { door: std.get(s, 'doorFinish', s.paint), glass: 'glass-clear' }, {
      hinge_a: ['stile', [0.5, 0.1, 0.5]],
      hinge_b: ['stile', [0.5, 0.9, 0.5]],
    }),
  local leaves = if std.get(s, 'doorLeaves', 2) == 2 then [leafRow('_door_fwd', 1), leafRow('_door_aft', 0)] else [leafRow('_door', 1)],
  local bumper(suffix, x0, x1, mass) = k.compound(id + suffix, mass, [
    box('bar', 'bar', [x0, std.get(s, 'bumperY', [0.28, 0.6])[0], -(s.side + 0.03125)], [x1, std.get(s, 'bumperY', [0.28, 0.6])[1], s.side + 0.03125]),
  ], { bar: std.get(s, 'bumperFinish', 'plastic-black') }),
  local lampY = s.headlampAt[1],
  local lampZ = s.headlampAt[2],
  local flatFront = if g.bonneted then [] else [
    k.compound(id + '_front_panel', 45, [
      box('mask', 'paint', [face - 0.08, s.sill, -s.skin], [face, screens[0][0], s.skin]),
      box('grille', 'trim', [face, 0.68, -0.6], [face + 0.015, 0.84, 0.6]),
    ] + k.bothSides([
      // Dark round the lamp, so a frosted lens still reads on a pale front.
      box('lamp_surround_low', 'trim', [face, lampY - 0.0625, lampZ - 0.25], [face + 0.03125, lampY, lampZ + 0.25]),
      box('lamp_surround_high', 'trim', [face, lampY + 0.22, lampZ - 0.25], [face + 0.03125, lampY + 0.28125, lampZ + 0.25]),
      box('lamp_surround_inner', 'trim', [face, lampY, lampZ - 0.25], [face + 0.03125, lampY + 0.22, lampZ - 0.17]),
      box('lamp_surround_outer', 'trim', [face, lampY, lampZ + 0.17], [face + 0.03125, lampY + 0.22, lampZ + 0.25]),
    ]), finish),
    bumper('_front_bumper', s.front - 0.04, s.front + 0.07, 40),
  ],
  // A bonnet stands on the cowl and carries its own wings, because the wheel it clears sits ahead of the body.
  local bon = std.get(s, 'bonnet', null),
  local noseX = s.front - 0.14,
  // The grille's surround alone owns the nose, so paint and trim don't share a face.
  local bonnetEnd = noseX - 0.04,
  local hoodY(x) = bon.cowlY + (bon.noseY - bon.cowlY) * (x - face) / (noseX - face),
  local bonnetRows = if !g.bonneted then [] else [
    k.compound(id + '_bonnet', 60, [
      prism('top', 'paint', [[face, hoodY(face) - 0.06], [bonnetEnd, hoodY(bonnetEnd) - 0.06], [bonnetEnd, hoodY(bonnetEnd)], [face, hoodY(face)]], [-bon.halfWidth, bon.halfWidth]),
    ] + k.bothSides([
      prism('flank', 'paint', [[face, bon.flankY], [bonnetEnd, bon.flankY], [bonnetEnd, hoodY(bonnetEnd)], [face, hoodY(face)]], [bon.halfWidth - 0.05, bon.halfWidth]),
    ]), { paint: s.paint }),
    k.compound(id + '_grille', 24, [
      box('surround', 'trim', [noseX - 0.04, bon.flankY, -bon.halfWidth], [noseX, hoodY(noseX), bon.halfWidth]),
    ] + [
      box('bar_' + i, 'bright', [noseX, bon.flankY + 0.06 + 0.11 * i, -bon.halfWidth + 0.34], [noseX + 0.03, bon.flankY + 0.1 + 0.11 * i, bon.halfWidth - 0.34])
      for i in std.range(0, std.floor((hoodY(noseX) - bon.flankY - 0.14) / 0.11))
    ], { trim: 'plastic-black', bright: 'steel-stainless' }),
    k.compound(id + '_front_wing', 35, [
      box('crown', 'paint', [face, s.archTop, bon.halfWidth], [noseX, s.archTop + 0.08, s.side - 0.02]),
      box('valance_rear', 'paint', [face, 0.62, bon.halfWidth], [s.frontAxle - s.arch, s.archTop, s.side - 0.02]),
      box('valance_front', 'paint', [s.frontAxle + s.arch, 0.62, bon.halfWidth], [noseX, s.archTop, s.side - 0.02]),
      prism('fillet_rear', 'paint', [[s.frontAxle - s.arch, s.archTop - archChamfer], [s.frontAxle - s.arch + archChamfer, s.archTop], [s.frontAxle - s.arch, s.archTop]], [bon.halfWidth, s.side - 0.02]),
      prism('fillet_front', 'paint', [[s.frontAxle + s.arch, s.archTop - archChamfer], [s.frontAxle + s.arch, s.archTop], [s.frontAxle + s.arch - archChamfer, s.archTop]], [bon.halfWidth, s.side - 0.02]),
      prism('shoulder', 'paint', [[face, s.archTop + 0.08], [noseX, s.archTop + 0.08], [noseX, s.archTop + 0.14], [face, hoodY(face) - 0.1]], [bon.halfWidth, bon.halfWidth + 0.14]),
    ], { paint: s.paint }),
    bumper('_front_bumper', noseX, s.front, 40),
  ],
  local driver = s.driver,
  local rearRows = [
    bumper('_rear_bumper', s.rear - 0.07, s.rear + 0.03, 35),
  ] + (if rearGlazed(s) then [
         k.compound(id + '_rear_window', 12 * std.length(rearGlass(s)) + (if flank == null then 0 else 12), [
           box('glass_' + i, 'glass', [s.rear + 0.02, rearGlass(s)[i].y[0], -rearGlass(s)[i].z], [s.rear + 0.06, rearGlass(s)[i].y[1], rearGlass(s)[i].z])
           for i in std.range(0, std.length(rearGlass(s)) - 1)
         ] + (if flank == null then [] else k.bothSides([
                box('flank', 'glass', [s.rear + 0.02, flank.y[0], flank.z[0]], [s.rear + 0.06, flank.y[1], flank.z[1]]),
              ])), { glass: 'glass-clear' }),
       ] else []) + (if has(s, 'engineHatch') then [
                       // A louvred hatch over the rear engine.
                       k.compound(id + '_rear_panel', 55, [
                         box('hatch', 'paint', [s.rear - 0.02, s.engineHatch[0], -s.tailLampAt[2] + 0.13], [s.rear + 0.01, s.engineHatch[1], s.tailLampAt[2] - 0.13]),
                       ] + [
                         box('louvre_' + i, 'trim', [s.rear - 0.035, s.engineHatch[0] + 0.1 + 0.12 * i, -0.75], [s.rear - 0.02, s.engineHatch[0] + 0.15 + 0.12 * i, 0.75])
                         for i in std.range(0, std.floor((s.engineHatch[1] - s.engineHatch[0] - 0.2) / 0.12))
                       ], finish),
                     ] else []),
  local upperFloor = if std.length(s.decks) < 2 then [] else
    local y = s.decks[1].floor;
    local well = s.stairWell;
    local runs = spans(s.rear + 0.08, xf(y) - 0.08, [well.x]);
    [
      k.compound(id + '_upper_floor', s.upperFloorMass, [
        box('deck_' + i, 'floor', [runs[i][0], y - 0.1, -s.skin], [runs[i][1], y, s.skin])
        for i in std.range(0, std.length(runs) - 1)
      ] + [
        box('beside_well', 'floor', [well.x[0], y - 0.1, well.z], [well.x[1], y, s.skin]),
      ], finish),
    ],
  rows: [shell, screenRow] + upperFloor + [paneRow(i) for i in std.range(0, std.length(s.decks) - 1)] + leaves + flatFront + bonnetRows + rearRows + [
    // Starts clear of the steering wheel's rim, leaving the driver's knees room.
    k.compound(id + '_dashboard', 40, [
      box('binnacle', 'trim', [driver.x + 0.48, s.floor, -s.skin], [xf(dashTop(s)) - 0.14, dashTop(s), -0.28]),
    ] + (if has(s, 'dashShelfTop') then [
           box('shelf', 'trim', [face - 0.5, s.floor, -0.28], [xf(s.dashShelfTop) - 0.14, s.dashShelfTop, s.skin]),
         ] else []), { trim: 'plastic-black' }),
  ] + (if has(s, 'sign') then [
         local y = s.sign.y;
         local face = xf(y[0]);
         k.compound(id + '_destination_sign', 8, [
           // Proud of the front wall, because the panel is see-through and a coplanar wall behind it would z-fight.
           box('case', 'trim', [xf(y[1]) - 0.06, y[0], -s.sign.z], [face + 0.04, y[1], s.sign.z]),
           box('lower_lip', 'trim', [face, y[0], -s.sign.z], [face + 0.05, y[0] + 0.04, s.sign.z]),
           box('upper_lip', 'trim', [face, y[1] - 0.04, -s.sign.z], [face + 0.05, y[1], s.sign.z]),
           box('panel', 'lit', [face, y[0] + 0.04, -s.sign.z + 0.06], [face + 0.07, y[1] - 0.04, s.sign.z - 0.06]),
         ], { trim: 'plastic-black', lit: 'plastic-orange' }),
       ] else []),
}.rows;
local items(kit, id, name, s) =
  local panel(suffix, label, capabilities) = kit.part(id + suffix, name + ' ' + label, kit.pileSize, capabilities);
  local g = layout(s);
  [
    panel('_shell', 'body shell', ['structure', 'protection']),
    panel('_windscreen', 'windscreen', ['glazing']),
    panel('_side_window', 'side window', ['glazing']),
    panel('_rear_bumper', 'rear bumper', ['protection']),
    panel('_front_bumper', 'front bumper', ['protection']),
    panel('_dashboard', 'dashboard', ['structure']),
  ]
  + (if std.length(s.decks) > 1 then [panel('_upper_window', 'upper window', ['glazing']), panel('_upper_floor', 'upper floor', ['structure'])] else [])
  + (if std.get(s, 'doorLeaves', 2) == 2 then [
       panel('_door_fwd', 'door, forward leaf', ['entry', 'glazing', 'protection']),
       panel('_door_aft', 'door, rear leaf', ['entry', 'glazing', 'protection']),
     ] else [panel('_door', 'door', ['entry', 'glazing', 'protection'])])
  + (if g.bonneted then [
       panel('_bonnet', 'bonnet', ['protection']),
       panel('_grille', 'grille', ['protection']),
       panel('_front_wing', 'front wing', ['protection']),
     ] else [panel('_front_panel', 'front panel', ['protection'])])
  + (if rearGlazed(s) then [panel('_rear_window', 'rear window', ['glazing'])] else [])
  + (if has(s, 'engineHatch') then [panel('_rear_panel', 'engine hatch', ['protection'])] else [])
  + (if has(s, 'sign') then [panel('_destination_sign', 'destination sign', ['light'])] else []);
local fittings(kit, id, s) =
  local fitting = kit.fitting;
  local pair = kit.pair;
  local on = kit.on;
  local origin = kit.origin;
  local g = layout(s);
  local p = s.power;
  local deckPanes = std.flattenArrays([
    local deck = s.decks[i];
    local panes = g.panes(deck);
    local doorBays = if i == 0 then [door.bay for door in s.doors] else [];
    std.flattenArrays([
      local twin = pair('pane_' + i + '_' + j, id + g.windowSuffix(i), [(panes[j][0] + panes[j][1]) / 2, deck.waist, s.side - 0.04], on(['shell']));
      if std.member(doorBays, j) then [twin[1]] else twin
      for j in std.range(0, deck.bays - 1)
    ])
    for i in std.range(0, std.length(s.decks) - 1)
  ]);
  local doorZ = s.side - 0.035;
  local doors = std.flattenArrays([
    local way = g.doorways[d];
    local w = g.leafWidth;
    if std.get(s, 'doorLeaves', 2) == 2 then [
      fitting('door_fwd_' + d, id + '_door_fwd', [way[1] - w / 2, s.doorSill, doorZ], ['shell']),
      fitting('door_aft_' + d, id + '_door_aft', [way[0] + w / 2, s.doorSill, doorZ], ['shell']),
    ] else [fitting('door_' + d, id + '_door', [way[1] - w / 2, s.doorSill, doorZ], ['shell'])]
    for d in std.range(0, std.length(g.doorways) - 1)
  ]);
  local seats = std.flattenArrays([
    local row = s.seats[i];
    // A row over a wheel well rests on the well and on a riser at `riser`, its aisle side.
    local risen = has(row, 'riser');
    local twin = pair('seat_' + i, row.part, [row.x, row.y, row.z], on(['shell'], if risen then ['seat_riser_' + i] else []))
                 + (if risen then pair('seat_riser_' + i, 'seat_riser', [row.x, s.floor, row.riser], on(['shell'])) else []);
    local side(n) = [twin[j] for j in std.range(0, std.length(twin) - 1) if j % 2 == n];
    if row.sides == 'both' then twin else if row.sides == 'near' then side(0) else side(1)
    for i in std.range(0, std.length(s.seats) - 1)
  ]);
  local d = s.driver;
  local driverBase = if plinthed(s) then 'driver_plinth' else 'shell';
  (if plinthed(s) then [fitting('driver_plinth', 'seat_plinth', [d.x, d.y, -d.z], ['shell'])] else [])
  + [
    fitting('shell', id + '_shell', origin),
    fitting('windscreen', id + '_windscreen', origin, ['shell']),
    fitting('rear_bumper', id + '_rear_bumper', origin, ['shell']),
    fitting('front_bumper', id + '_front_bumper', origin, ['shell']),
    fitting('dashboard', id + '_dashboard', origin, ['shell']),
    fitting('driver_seat', 'front_seat', [d.x, d.y, -d.z], [driverBase]),
    // Rises from inside the dash to the top of the wheel's hub.
    fitting('steering_column', 'steering_column', [d.x + 0.5, d.y + 0.4, -d.z], ['dashboard']),
    fitting('steering_wheel', 'steering_wheel', [d.x + 0.42, d.y + 0.62, -d.z], ['steering_column']),
    fitting('instruments', 'instrument_binnacle', [d.x + 0.64, dashTop(s), -d.z], ['dashboard']),
    fitting('gear_lever', 'gear_lever', [d.x + 0.36, d.y, -d.z + 0.34], [driverBase]),
    fitting('rear_axle', 'beam_axle_truck', [s.rearAxle, s.wheelR - 0.52, 0], ['shell']),
    fitting('front_axle', std.get(s, 'frontAxlePart', 'steered_axle_heavy'), [s.frontAxle, s.wheelR - 0.52, 0], ['shell']),
    fitting('engine', p.engine, p.engineAt, ['shell']),
    fitting('gearbox', p.gearbox, p.gearboxAt, ['engine']),
    fitting('radiator', p.radiator, p.radiatorAt, ['shell']),
    fitting('fuel_tank', p.tank, p.tankAt, ['shell']),
    fitting('exhaust', p.exhaust, p.exhaustAt, ['engine', 'shell']),
  ]
  + [fitting('prop_shaft_' + i, p.shafts[i].part, p.shafts[i].at, ['gearbox', 'rear_axle']) for i in std.range(0, std.length(p.shafts) - 1)]
  + (if g.bonneted then [
       fitting('bonnet', id + '_bonnet', origin, ['shell']),
       fitting('grille', id + '_grille', origin, ['shell']),
     ] + pair('front_wing', id + '_front_wing', origin, on(['shell']))
     else [fitting('front_panel', id + '_front_panel', origin, ['shell'])])
  + (if rearGlazed(s) then [fitting('rear_window', id + '_rear_window', origin, ['shell'])] else [])
  + (if has(s, 'engineHatch') then [fitting('rear_panel', id + '_rear_panel', origin, ['shell'])] else [])
  + (if has(s, 'sign') then [fitting('destination_sign', id + '_destination_sign', origin, ['shell'])] else [])
  + (if std.length(s.decks) > 1 then [fitting('upper_floor', id + '_upper_floor', origin, ['shell'])] else [])
  + deckPanes
  + doors
  + seats
  + pair('front_wheel', s.wheel, [s.frontAxle, s.wheelR, s.wheelZ], on(['front_axle']))
  + pair('rear_wheel', s.wheel, [s.rearAxle, s.wheelR, s.wheelZ], on(['rear_axle']))
  + pair('rear_inner_wheel', s.wheel, [s.rearAxle, s.wheelR, s.wheelZ - s.wheelTwin], on(['rear_axle']))
  + pair('door_mirror', 'door_mirror_bus', s.mirrorAt, on(['shell']))
  + pair('tail_lamp', 'tail_lamp_tall', s.tailLampAt, on(['shell']))
  + pair('headlamp', 'headlamp_large', s.headlampAt, on([if g.bonneted then 'grille' else 'front_panel']))
  + kit.batteryBay('truck_battery_tray', p.batteryAt, ['shell']);
{ rows: rows, items: items, fittings: fittings, layout: layout }
