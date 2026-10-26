// Head gear in the worn frame: origin at the centre of deadvox's head region, y up, the face toward +z, the wearer's
// left at +x. Clearances are measured against the player bust's head (`avatar.libsonnet`, `bust`).
local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local box(id, slot, min, max) = { id: id, kind: 'box', slot: slot, min: min, max: max };
local turned(id, slot, axis, profile, origin) = { id: id, kind: 'turned', slot: slot, axis: axis, profile: profile, origin: origin };
local disc(radius, length) = [[0, 0], [0, radius], [length, radius], [length, 0], [0, 0]];
// A ring sector between two bearings, in degrees from the face toward the left, as y prisms; a y prism's profile is
// (z, x), so a point at bearing b and radius r is [r cos b, r sin b] and rising bearings wind counterclockwise.
local rad(degrees) = degrees * std.pi / 180;
local at(r, b, z0) = [z0 + r * std.cos(rad(b)), r * std.sin(rad(b))];
local arc(id, slot, radii, bearings, step, heights, z0) = [
  {
    id: '%s_%d' % [id, i],
    kind: 'prism',
    slot: slot,
    axis: 'y',
    profile: [at(radii[1], a, z0), at(radii[1], a + step, z0), at(radii[0], a + step, z0), at(radii[0], a, z0)],
    start: heights[0],
    end: heights[1],
  }
  for i in std.range(0, std.floor((bearings[1] - bearings[0]) / step) - 1)
  for a in [bearings[0] + i * step]
];

local h = {
  back: 0,
  // The bust's crown is a block, so the shell's round plan has to clear the block's corners, not only its sides.
  inner: 0.14,
  outer: 0.153,
  // The face opening's top edge sits above the eyes.
  brow: 0.055,
  // The dome rises from above the crown block's lower edge, so the upright wall, not the curve, passes its corners.
  domeBase: 0.1,
  crownInner: 0.085,
  crownOuter: 0.098,
  skirtBottom: -0.03,
  // The face opening's half-width, in degrees either side of the face.
  opening: 70,
  pivotBearing: 100,
  pivotHeight: 0.038,
  visorInner: 0.162,
  visorOuter: 0.168,
  // The visor reaches below the chin, so a blow from the front meets it rather than the jaw.
  visorBottom: -0.13,
  visorTop: 0.042,
};
// A squared dome, a superellipse of exponent four: a round dome low enough to look right would cut the crown's top
// edges.
local dome(steps) =
  local point(r, height, i) = [height * std.sqrt(std.sin(rad(90 * i / steps))), r * std.sqrt(std.cos(rad(90 * i / steps)))];
  // Material lies left of travel: in along the rim, up the inside, then down the outside.
  [point(h.inner, h.crownInner, i) for i in std.range(0, steps)]
  + [point(h.outer, h.crownOuter, steps - i) for i in std.range(0, steps)]
  + [point(h.inner, h.crownInner, 0)];
local pivotX = (h.visorInner - 0.01) * std.sin(rad(h.pivotBearing));
local pivotZ = h.back + (h.visorInner - 0.01) * std.cos(rad(h.pivotBearing));
local pivot(side) = [
  turned('pivot_%s' % side, 'shell', 'x', disc(0.022, 0.022), [if side == 'left' then h.outer - 0.004 else -(h.outer - 0.004) - 0.022, h.pivotHeight, pivotZ]),
  turned('pivot_knob_%s' % side, 'metal', 'x', disc(0.009, 0.008), [if side == 'left' then h.outer + 0.018 else -(h.outer + 0.018) - 0.008, h.pivotHeight, pivotZ]),
];
local strap(sign) = [
  box('chin_strap_%d' % (if sign > 0 then 1 else 2), 'strap', [std.min(sign * 0.088, sign * 0.098), -0.115, -0.005], [std.max(sign * 0.088, sign * 0.098), -0.025, 0.015]),
  box('strap_tab_%d' % (if sign > 0 then 1 else 2), 'strap', [std.min(sign * 0.088, sign * (h.inner + 0.005)), -0.035, -0.005], [std.max(sign * 0.088, sign * (h.inner + 0.005)), -0.02, 0.015]),
];
local pieces =
  [turned('dome', 'shell', 'y', dome(8), [0, h.domeBase, h.back])]
  + arc('skirt', 'shell', [h.inner, h.outer], [h.opening, 360 - h.opening], 10, [h.skirtBottom, h.domeBase], h.back)
  + arc('forehead', 'shell', [h.inner, h.outer], [-h.opening, h.opening], 10, [h.brow, h.domeBase], h.back)
  // The rubber edge runs along the shell's front, from one side of the face opening to the other.
  + arc('edge', 'trim', [h.outer - 0.004, h.outer + 0.006], [-h.opening, h.opening], 10, [h.brow - 0.005, h.brow + 0.007], h.back)
  // The visor's frame band crosses the brow from pivot to pivot.
  + arc('band', 'shell', [h.outer + 0.004, h.visorInner], [-h.pivotBearing, h.pivotBearing], 10, [h.pivotHeight - 0.014, h.brow], h.back)
  + arc('visor', 'visor', [h.visorInner, h.visorOuter], [-90, 90], 10, [h.visorBottom, h.visorTop], h.back)
  // The curtain hangs from the skirt round the back and flares as it falls, to keep a blow off the neck.
  + arc('curtain_upper', 'curtain', [h.inner + 0.005, h.outer + 0.004], [h.pivotBearing, 360 - h.pivotBearing], 20, [-0.075, h.skirtBottom + 0.005], h.back)
  + arc('curtain_lower', 'curtain', [h.outer - 0.002, h.outer + 0.012], [h.pivotBearing, 360 - h.pivotBearing], 20, [-0.125, -0.075], h.back)
  + pivot('left') + pivot('right')
  + strap(1) + strap(-1)
  + [box('chin_cup', 'strap', [-0.098, -0.118, -0.005], [0.098, -0.105, 0.06])];
local g = {
  eyeSpacing: 0.076,
  tubeRadius: 0.023,
  tubeBack: 0.102,
  tubeFront: 0.178,
  lensDepth: 0.004,
  strapHalfWidth: 0.093,
  strapFront: 0.103,
  strapBack: 0.105,
  strapWall: 0.004,
  strapBottom: 0.026,
  strapTop: 0.048,
};
// Hair makes the rear corners square; a circular band either floats off the sides or cuts those corners.
local strapOutline(x, front, back) = [
  [-back + 0.002, -x], [front - 0.025, -x], [front, -x + 0.025], [front, x - 0.025],
  [front - 0.025, x], [-back + 0.002, x], [-back, x - 0.002], [-back, -x + 0.002],
];
local strapInner = strapOutline(g.strapHalfWidth, g.strapFront, g.strapBack);
local strapOuter = strapOutline(g.strapHalfWidth + g.strapWall, g.strapFront + g.strapWall, g.strapBack + g.strapWall);
local goggleStrap = [
  {
    id: 'strap_%d' % i, kind: 'prism', slot: 'strap', axis: 'y',
    profile: [strapInner[i], strapOuter[i], strapOuter[(i + 1) % 8], strapInner[(i + 1) % 8]],
    start: g.strapBottom, end: g.strapTop,
  }
  for i in std.range(0, 7)
];
local optic(side) = [
  turned('tube_%s' % side, 'body', 'z', disc(g.tubeRadius, g.tubeFront - g.tubeBack),
         [if side == 'left' then g.eyeSpacing / 2 else -g.eyeSpacing / 2, 0, g.tubeBack]),
  turned('lens_%s' % side, 'lens', 'z', disc(g.tubeRadius * 0.85, g.lensDepth),
         [if side == 'left' then g.eyeSpacing / 2 else -g.eyeSpacing / 2, 0, g.tubeFront]),
];
local goggleAnchor(solid, fraction) = { part: 'goggles', solid: solid, fraction: fraction };
[
  {
    id: 'riot_helmet',
    exportMass: 'parts',
    parts: [{
      id: 'helmet',
      family: 'compound',
      massKg: 1.4,
      params: params({ pieces: pieces }),
      finish: { shell: 'paint-charcoal', trim: 'rubber-black', visor: 'glass-clear', curtain: 'polymer-black', strap: 'polymer-black', metal: 'steel-grey' },
      ports: [],
    }],
    connections: [],
    handling: { part: 'helmet', solid: 'dome', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
  },
  {
    id: 'night_vision_goggles',
    exportMass: 'parts',
    voxelGrain: 0.002,
    parts: [{
      id: 'goggles', family: 'compound', massKg: 0.55,
      params: params({ pieces: goggleStrap + optic('left') + optic('right') + [
        box('bridge', 'body', [-0.064, 0.014, 0.103], [0.064, 0.034, 0.125]),
      ] }),
      finish: { body: 'polymer-od-green', strap: 'rubber-black', lens: 'glass-lens-green' },
      ports: [],
    }],
    connections: [],
    handling: { part: 'goggles', solid: 'bridge', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
    anchors: {
      eye_left: goggleAnchor('tube_left', [0.5, 0.5, 0]),
      eye_right: goggleAnchor('tube_right', [0.5, 0.5, 0]),
      lens_left: goggleAnchor('lens_left', [0.5, 0.5, 1]),
      lens_right: goggleAnchor('lens_right', [0.5, 0.5, 1]),
      lens_left_edge: goggleAnchor('lens_left', [1, 0.5, 1]),
      lens_right_edge: goggleAnchor('lens_right', [1, 0.5, 1]),
      strap_left_inner: goggleAnchor('strap_4', [0, 0.5, 0.5]),
      strap_left_outer: goggleAnchor('strap_4', [1, 0.5, 0.5]),
      strap_right_inner: goggleAnchor('strap_0', [1, 0.5, 0.5]),
      strap_right_outer: goggleAnchor('strap_0', [0, 0.5, 0.5]),
      strap_front_inner: goggleAnchor('strap_2', [0.5, 0.5, 0]),
      strap_front_outer: goggleAnchor('strap_2', [0.5, 0.5, 1]),
      strap_back_inner: goggleAnchor('strap_6', [0.5, 0.5, 1]),
      strap_back_outer: goggleAnchor('strap_6', [0.5, 0.5, 0]),
    },
  },
]
