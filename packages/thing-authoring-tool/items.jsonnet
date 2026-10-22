local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, ports=[]) = { id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: ports };
local port(id, gender, pos, normal) = { id: id, mount: 'assembly-joint', gender: gender, pos: pos, normal: normal, up: [1, 0, 0], required: true };
local atom(id, family, massKg, dimensions, finish, exportMass) = { id: id, exportMass: exportMass, parts: [part(id, family, massKg, dimensions, finish)], connections: [] };
{
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
  facets: 48,
  defaultMaterial: 'paint-charcoal',
  items: (import 'packages.libsonnet') + (import 'cans.libsonnet').items + (import 'materials.libsonnet') + (import 'food-medical.libsonnet') + (import 'shamblerParts.libsonnet') + (import 'vehicle-parts.libsonnet') + (import 'equipment.libsonnet') + [
    atom('electrical_tape', 'ring', 0.030, { outerRadius: 0.04, innerRadius: 0.012, coreRadius: 0.016, height: 0.021 }, { body: 'paint-terracotta', core: 'paperboard-tan' }, exportMass='parts'),
    atom('sewing_thread', 'spool', 0.015, { outerRadius: 0.027, coreRadius: 0.018, windingRadius: 0.026, height: 0.05, flangeHeight: 0.008, flangeInset: 0.004, windings: 5, grooveDepth: 0.0015 }, { core: 'paperboard-tan', winding: 'paint-terracotta' }, exportMass='parts'),
    atom('nylon_cord', 'coil', 0.060, { radius: 0.029, tubeRadius: 0.0035, turns: 4, pitch: 0.006 }, { body: 'cord-olive' }, exportMass='parts'),
    atom('fuse', 'fuse', 0.010, { radius: 0.009, capRadius: 0.011, length: 0.07, capLength: 0.008 }, { body: 'glass-grey', cap: 'steel-grey' }, exportMass='parts'),
    atom('bear_trap', 'bearTrap', 4.500, {
      jawRadius: 0.16, jawWidth: 0.014, jawThickness: 0.008, jawSegments: 8,
      toothCount: 9, toothHeight: 0.018,
      barWidth: 0.035, barHeight: 0.012,
      springLength: 0.17, springWidth: 0.04, springThickness: 0.01,
      panRadius: 0.06, panHeight: 0.006,
      linkCount: 5, linkRadius: 0.018, linkWire: 0.005,
    }, { frame: 'steel-parkerized', jaw: 'steel-grey', chain: 'steel-grey' }, exportMass='parts'),
    {
      id: 'dead_desk_lamp',
      exportMass: 'parts',
      parts: [
        part('base', 'cylinder', 0.500, { radius: 0.047, height: 0.012 }, { body: 'paint-charcoal' }, [port('arm', 'female', [0, 0.012, 0], [0, 1, 0])]),
        part('arm', 'arm', 0.250, { elbowX: -0.025, elbowY: 0.085, endX: 0.07, endY: 0.13, width: 0.01, depth: 0.012 }, { body: 'steel-grey' }, [port('base', 'male', [0, 0, 0], [0, -1, 0]), port('shade', 'female', [0.07, 0.13, 0], [0, 1, 0])]),
        part('shade', 'shade', 0.150, { bottomRadius: 0.05, topRadius: 0.025, height: 0.04, wall: 0.003 }, { body: 'paint-terracotta' }, [port('arm', 'male', [0, 0, 0], [0, -1, 0])]),
      ],
      connections: [{ from: 'base.arm', to: 'arm.base' }, { from: 'arm.shade', to: 'shade.arm' }],
    },
  ],
}
