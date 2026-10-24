local params(values) = { [key]: if std.type(values[key]) == 'array' then std.manifestJson(values[key]) else std.toString(values[key]) for key in std.objectFields(values) };
local item(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
local compound(id, massKg, pieces, finish) = item(id, 'compound', massKg, { pieces: pieces }, finish);
local box(id, slot, min, max) = { id: id, slot: slot, kind: 'box', min: min, max: max };
local turned(id, slot, axis, profile, origin=null) = { id: id, slot: slot, kind: 'turned', axis: axis, profile: profile } + (if origin == null then {} else { origin: origin });
local prism(id, slot, axis, profile, start, end) = { id: id, slot: slot, kind: 'prism', axis: axis, profile: profile, start: start, end: end };
// A tool lies along x and takes its grip on a named solid; a flat-bladed one lies in the xz plane, as deadvox's melee tools do.
local gripOn(id, solid) = { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 90 };
// A butt hinge opened flat, knuckle along x at (cx, cz): two leaves of 0.027 m either side of a 0.007 m knuckle.
local hinge(name, cx, cz) = [
  box(name + '-leaf-a', 'leaf', [cx - 0.0375, 0, cz - 0.030], [cx + 0.0375, 0.002, cz - 0.0035]),
  box(name + '-leaf-b', 'leaf', [cx - 0.0375, 0, cz + 0.0035], [cx + 0.0375, 0.002, cz + 0.030]),
  turned(name + '-knuckle', 'knuckle', 'x', [[0, 0], [0, 0.0035], [0.075, 0.0035], [0.075, 0]], [cx - 0.0375, 0.0035, cz]),
];
// A wood screw lying across the lid, head at its start.
local screw(name, z) = turned(name, 'screw', 'x', [[0, 0], [0, 0.0045], [0.003, 0.0045], [0.003, 0.0028], [0.050, 0.0028], [0.053, 0]], [-0.025, 0.0395, z]);
[
  // A 20 inch panel saw: 0.5 m overall with the handle, a 0.4 m blade tapering from 0.11 m to 0.03 m deep.
  compound('hand_saw', 0.650, [
    box('rear', 'handle', [0, -0.015, -0.060], [0.030, 0.015, 0.060]),
    box('top', 'handle', [0.030, -0.015, 0.040], [0.100, 0.015, 0.060]),
    box('bottom', 'handle', [0.030, -0.015, -0.060], [0.100, 0.015, -0.040]),
    box('front', 'handle', [0.070, -0.015, -0.040], [0.100, 0.015, 0.040]),
    prism('blade', 'blade', 'y', [[-0.055, 0.100], [0.055, 0.100], [0.015, 0.500], [-0.015, 0.500]], -0.002, 0.002),
  ], { handle: 'wood-walnut', blade: 'steel-grey' }) + {
    handling: gripOn('hand_saw', 'rear'),
    voxelGrain: 0.004,
  },
  // A 150 mm shank with a 105 mm moulded handle, 0.255 m overall.
  compound('screwdriver', 0.160, [
    turned('handle', 'handle', 'x', [[0, 0], [0, 0.010], [0.008, 0.015], [0.085, 0.016], [0.105, 0.011], [0.105, 0]]),
    turned('shaft', 'shaft', 'x', [[0.105, 0], [0.105, 0.0035], [0.250, 0.0035], [0.255, 0.002], [0.255, 0]]),
  ], { handle: 'plastic-yellow', shaft: 'steel-blued' }) + {
    handling: gripOn('screwdriver', 'handle'),
    voxelGrain: 0.002,
  },
  // A small reel of bare copper wire, 94 mm across the flanges and 60 mm wide.
  item('copper_wire', 'spool', 0.080, {
    outerRadius: 0.047, coreRadius: 0.015, windingRadius: 0.040, height: 0.060,
    flangeHeight: 0.004, flangeInset: 0.002, windings: 6, grooveDepth: 0.002,
  }, { core: 'plastic-black', winding: 'copper' }) + { voxelGrain: 0.004 },
  // A 32 mm outer diameter compression spring of 4 mm stock, eight turns.
  item('small_spring', 'coil', 0.020, { radius: 0.014, tubeRadius: 0.002, turns: 8, pitch: 0.005 }, { body: 'steel-grey' }) + { voxelGrain: 0.002 },
  // Four 75 mm brass butt hinges with steel pins, opened flat, two by two.
  compound('hinge_set', 0.360,
    hinge('a', -0.040, -0.034) + hinge('b', 0.040, -0.034) + hinge('c', -0.040, 0.034) + hinge('d', 0.040, 0.034),
    { leaf: 'brass', knuckle: 'steel-grey' }) + { voxelGrain: 0.002 },
  // A small hardware box with three wood screws laid on its lid.
  compound('fastener_pack', 0.180, [
    box('tray', 'box', [-0.045, 0, -0.030], [0.045, 0.034, 0.030]),
    box('lid', 'lid', [-0.046, 0.034, -0.031], [0.046, 0.037, 0.031]),
    screw('screw-a', -0.016),
    screw('screw-b', 0),
    screw('screw-c', 0.016),
  ], { box: 'paperboard-tan', lid: 'paint-terracotta', screw: 'steel-grey' }) + { voxelGrain: 0.002 },
  // A pocket torch strapped to a steel plate with two tape bands.
  compound('taped_flashlight_mount', 0.120, [
    box('plate', 'plate', [-0.060, 0, -0.025], [0.065, 0.003, 0.025]),
    turned('torch', 'torch', 'x', [[0, 0], [0, 0.014], [0.100, 0.014], [0.115, 0.019], [0.125, 0.019], [0.125, 0]], [-0.060, 0.022, 0]),
    turned('lens', 'lens', 'x', [[0.125, 0], [0.125, 0.017], [0.130, 0.017], [0.130, 0]], [-0.060, 0.022, 0]),
    box('band-a', 'band', [-0.040, 0, -0.021], [-0.032, 0.041, 0.021]),
    box('band-b', 'band', [0.010, 0, -0.021], [0.018, 0.041, 0.021]),
  ], { plate: 'steel-grey', torch: 'polymer-black', lens: 'plastic-white', band: 'tape-grey' }) + { voxelGrain: 0.004 },
  // A vertical grip: an 80 mm wood handle in a rubber sleeve under a clamp plate.
  compound('scrap_foregrip', 0.180, [
    box('plate', 'plate', [-0.025, 0.080, -0.025], [0.025, 0.086, 0.025]),
    turned('handle', 'handle', 'y', [[0, 0], [0, 0.018], [0.010, 0.022], [0.070, 0.022], [0.080, 0.018], [0.080, 0]]),
    turned('sleeve', 'sleeve', 'y', [[0.015, 0], [0.015, 0.0235], [0.065, 0.0235], [0.065, 0]]),
  ], { plate: 'scrap-rusted', handle: 'wood-birch', sleeve: 'rubber-black' }) + { voxelGrain: 0.004 },
]
