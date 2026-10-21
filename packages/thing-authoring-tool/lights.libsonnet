local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, ports=[]) = { id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: ports };
local port(id, gender, pos, normal, up=[1, 0, 0]) = { id: id, mount: 'assembly-joint', gender: gender, pos: pos, normal: normal, up: up, required: true };
[
  {
    id: 'frag_grenade',
    parts: [part('grenade', 'grenade', 0.400, {
      radius: 0.032, height: 0.068, neckRadius: 0.010, neckHeight: 0.008, headRadius: 0.0125, headHeight: 0.012,
      leverWidth: 0.014, leverThickness: 0.002, leverGap: 0.0015, leverEndDegrees: 115, ringRadius: 0.011, ringTube: 0.0013,
    }, { body: 'polymer-od-green', metal: 'steel-grey' })],
    connections: [],
    handling: { part: 'grenade', solid: 'body', fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
  },
  // Broken in a fall: the arm is kinked and the shade hangs forward off its joint.
  {
    id: 'dead_desk_lamp',
    parts: [
      part('base', 'cylinder', 0.500, { radius: 0.047, height: 0.012 }, { body: 'paint-charcoal' }, [port('arm', 'female', [0, 0.012, 0], [0, 1, 0])]),
      part('arm', 'arm', 0.250, { elbowX: -0.02, elbowY: 0.10, endX: 0.055, endY: 0.06, width: 0.01, depth: 0.012 }, { body: 'steel-grey' }, [port('base', 'male', [0, 0, 0], [0, -1, 0]), port('shade', 'female', [0.055, 0.06, 0], [0.8, -0.6, 0], [-0.6, -0.8, 0])]),
      part('shade', 'shade', 0.150, { bottomRadius: 0.05, topRadius: 0.025, height: 0.04, wall: 0.003 }, { body: 'paint-terracotta' }, [port('arm', 'male', [0, 0, 0], [0, -1, 0])]),
    ],
    connections: [{ from: 'base.arm', to: 'arm.base' }, { from: 'arm.shade', to: 'shade.arm' }],
  },
]
