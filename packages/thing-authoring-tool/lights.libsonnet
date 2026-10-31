local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, ports=[]) = { id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: ports };
local port(id, gender, pos, normal, up=[1, 0, 0]) = { id: id, mount: 'assembly-joint', gender: gender, pos: pos, normal: normal, up: up, required: true };
[
  {
    id: 'frag_grenade',
    exportMass: 'parts',
    parts: [part('grenade', 'grenade', 0.400, {
      radius: 0.032, height: 0.068, neckRadius: 0.010, neckHeight: 0.008, headRadius: 0.0125, headHeight: 0.012,
      leverWidth: 0.014, leverThickness: 0.002, leverGap: 0.0015, leverEndDegrees: 115, ringRadius: 0.011, ringTube: 0.0013,
    }, { body: 'polymer-od-green', metal: 'steel-grey' })],
    connections: [],
    handling: { part: 'grenade', solid: 'body', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
  },
  // Burn-down mass belongs to the inventory row, so these export no part masses.
  {
    id: 'torch',
    exportMass: 'inventory-atom',
    parts: [part('torch', 'torch', 0.350, { length: 0.42, shaftRadius: 0.014, headLength: 0.10, headRadius: 0.03 }, { shaft: 'wood-birch', head: 'cloth-charred' })],
    connections: [],
    handling: { part: 'torch', solid: 'shaft', fraction: [0.3, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', rest: 'upright', roll: 0 },
    anchors: { flame: { part: 'torch', solid: 'head', fraction: [1, 0.5, 0.5] } },
    glow: 'head',
  },
  {
    id: 'candle',
    exportMass: 'inventory-atom',
    parts: [part('candle', 'candle', 0.150, { radius: 0.023, height: 0.10, wickRadius: 0.0012, wickHeight: 0.012 }, { body: 'wax-ivory', wick: 'cloth-charred' })],
    connections: [],
    handling: { part: 'candle', solid: 'body', fraction: [0.4, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', rest: 'upright', roll: 0 },
    anchors: { flame: { part: 'candle', solid: 'wick', fraction: [1, 0.5, 0.5] } },
    // Fine enough for the wick to read and the flame to sit on it; the item grain draws the candle as a square block.
    voxelGrain: 0.002,
  },
  {
    id: 'oil_lamp',
    exportMass: 'parts',
    parts: [
      part('base', 'cylinder', 0.400, { radius: 0.052, height: 0.012 }, { body: 'steel-grey' }, [port('reservoir', 'female', [0, 0.012, 0], [0, 1, 0])]),
      part('reservoir', 'reservoir', 0.120, { innerRadius: 0.044, outerRadius: 0.050, height: 0.060 }, { glass: 'glass-clear' }, [port('base', 'male', [0, 0, 0], [0, -1, 0]), port('burner', 'female', [0, 0.060, 0], [0, 1, 0]), port('fuel', 'female', [0, 0.005, 0], [0, 1, 0])]),
      part('fuel_fill', 'cylinder', 0.001, { radius: 0.039, height: 0.050 }, { body: 'fuel-amber' }, [port('reservoir', 'male', [0, 0, 0], [0, -1, 0])]),
      part('burner', 'cylinder', 0.080, { radius: 0.016, height: 0.012 }, { body: 'brass' }, [port('reservoir', 'male', [0, 0, 0], [0, -1, 0]), port('chimney', 'female', [0, 0.012, 0], [0, 1, 0])]),
      part('chimney', 'chimney', 0.080, { lowerRadius: 0.026, upperRadius: 0.020, height: 0.100, wall: 0.002 }, { glass: 'glass-clear' }, [port('burner', 'male', [0, 0, 0], [0, -1, 0])]),
    ],
    connections: [{ from: 'base.reservoir', to: 'reservoir.base' }, { from: 'reservoir.fuel', to: 'fuel_fill.reservoir' }, { from: 'reservoir.burner', to: 'burner.reservoir' }, { from: 'burner.chimney', to: 'chimney.burner' }],
    handling: { part: 'base', solid: 'body', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
    anchors: { flame: { part: 'burner', solid: 'body', fraction: [0.5, 1, 0.5] } },
    voxelGrain: 0.002,
  },
  // Broken in a fall: the arm is kinked and the shade hangs forward off its joint.
  {
    id: 'dead_desk_lamp',
    exportMass: 'parts',
    parts: [
      part('base', 'cylinder', 0.500, { radius: 0.047, height: 0.012 }, { body: 'paint-charcoal' }, [port('arm', 'female', [0, 0.012, 0], [0, 1, 0])]),
      part('arm', 'arm', 0.250, { elbowX: -0.02, elbowY: 0.10, endX: 0.055, endY: 0.06, width: 0.01, depth: 0.012 }, { body: 'steel-grey' }, [port('base', 'male', [0, 0, 0], [0, -1, 0]), port('shade', 'female', [0.055, 0.06, 0], [0.8, -0.6, 0], [-0.6, -0.8, 0])]),
      part('shade', 'shade', 0.150, { bottomRadius: 0.05, topRadius: 0.025, height: 0.04, wall: 0.003 }, { body: 'paint-terracotta' }, [port('arm', 'male', [0, 0, 0], [0, -1, 0])]),
    ],
    connections: [{ from: 'base.arm', to: 'arm.base' }, { from: 'arm.shade', to: 'shade.arm' }],
  },
]
